'use client';

import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '@/services/apiClient';
import { PageContainer } from '@/components/common/page-container';
import { ResponsiveGrid } from '@/components/common/responsive-grid';
import {
  AlertTriangle, CheckCircle2, Clock, Loader2,
  ChefHat, CreditCard, Users, RefreshCw, ShieldAlert, Unlock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';

// ─── Types ────────────────────────────────────────────────────────────────────

type TableStatus =
  | 'free'
  | 'occupied'
  | 'billing_done'
  | 'waiting_for_service_completion'
  | 'ready_to_free';

interface TableRow {
  table_id: string;
  table_number: string;
  status: TableStatus;
  is_bill_paid: boolean;
  occupied_since: string | null;
  active_item_count: number;
  pending_count: number;
  preparing_count: number;
  ready_count: number;
  paid_bills: number;
  unpaid_bills: number;
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TableStatus, {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
  action: string | null;
}> = {
  free: {
    label: 'Free',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    icon: <CheckCircle2 size={14} />,
    action: null,
  },
  occupied: {
    label: 'Occupied',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: <Users size={14} />,
    action: 'Mark Items Served',
  },
  billing_done: {
    label: 'Bill Generated',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: <CreditCard size={14} />,
    action: 'Mark as Paid',
  },
  waiting_for_service_completion: {
    label: 'Waiting for Service',
    color: 'text-orange-700',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    icon: <ChefHat size={14} />,
    action: 'Check & Free Table',
  },
  ready_to_free: {
    label: 'Ready to Free',
    color: 'text-green-700',
    bg: 'bg-green-50',
    border: 'border-green-200',
    icon: <Unlock size={14} />,
    action: 'Free Table',
  },
};

// ─── ForceFreee Dialog ─────────────────────────────────────────────────────────

function ForceFreeDialog({
  table,
  onClose,
  onConfirm,
}: {
  table: TableRow | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    await onConfirm(reason.trim());
    setBusy(false);
    setReason('');
    onClose();
  };

  return (
    <Dialog open={!!table} onOpenChange={() => { onClose(); setReason(''); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <ShieldAlert size={18} />
            Admin Force Free — Table {table?.table_number}
          </DialogTitle>
          <DialogDescription>
            This bypasses ALL validation checks. The table will be freed immediately
            regardless of pending bills or active kitchen items. This action is audited.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <label className="text-sm font-semibold text-gray-700">
            Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            className="w-full rounded-lg border border-gray-300 p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
            rows={3}
            placeholder="Enter mandatory reason for force-free..."
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); setReason(''); }}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || busy}
            onClick={handleConfirm}
          >
            {busy ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
            Force Free Table
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TableStatusPage() {
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [forceFreeTable, setForceFreeTable] = useState<TableRow | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchTables = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await apiClient.get('/tables');
      setTables(res.data);
    } catch {
      showToast('Failed to load tables', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTables();
    const interval = setInterval(() => fetchTables(true), 15000);
    return () => clearInterval(interval);
  }, [fetchTables]);

  const handleFreeTable = async (table: TableRow) => {
    setActionBusy(table.table_id);
    try {
      const res = await apiClient.post(`/tables/${table.table_id}/free`);
      showToast(res.data.message || 'Table freed!');
      fetchTables(true);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Cannot free table.';
      showToast(msg, 'error');
    } finally {
      setActionBusy(null);
    }
  };

  const handleForceFree = async (table: TableRow, reason: string) => {
    try {
      await apiClient.post(`/tables/${table.table_id}/force-free`, { reason });
      showToast(`Table ${table.table_number} force-freed.`);
      fetchTables(true);
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Force-free failed.', 'error');
    }
  };

  const summary = {
    free: tables.filter(t => t.status === 'free').length,
    occupied: tables.filter(t => t.status !== 'free').length,
    waiting: tables.filter(t => t.status === 'waiting_for_service_completion').length,
    readyToFree: tables.filter(t => t.status === 'ready_to_free').length,
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary opacity-50" />
      </div>
    );
  }

  return (
    <PageContainer className="p-0 space-y-6 animate-in fade-in duration-500">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 flex items-center gap-2 rounded-xl px-5 py-3 shadow-xl text-sm font-medium transition-all
            ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}
        >
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight">Table Status</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Live table lifecycle view — refreshes every 15 seconds
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchTables(true)} disabled={refreshing} className="h-11 sm:h-9 shrink-0 self-start sm:self-auto px-4">
          <RefreshCw size={14} className={refreshing ? 'animate-spin mr-2' : 'mr-2'} />
          Refresh
        </Button>
      </div>

      {/* Summary strip */}
      <ResponsiveGrid columns={{ mobile: 2, tablet: 4, desktop: 4 }} className="gap-4">
        {[
          { label: 'Free', value: summary.free, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
          { label: 'Occupied', value: summary.occupied, color: 'text-blue-600 bg-blue-50 border-blue-200' },
          { label: 'Waiting Service', value: summary.waiting, color: 'text-orange-600 bg-orange-50 border-orange-200' },
          { label: 'Ready to Free', value: summary.readyToFree, color: 'text-green-700 bg-green-50 border-green-200' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border px-5 py-4 ${s.color}`}>
            <div className="text-3xl font-black">{s.value}</div>
            <div className="text-xs font-semibold mt-1">{s.label}</div>
          </div>
        ))}
      </ResponsiveGrid>

      {/* Business Rule Banner */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 flex items-start gap-3 text-amber-800 text-sm">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
        <div>
          <span className="font-bold">Core Rule: </span>
          Billing completion does NOT mean dining completion. A table is freed only when
          ALL bills are PAID <em>and</em> ALL KOT items are SERVED/DELIVERED/CANCELLED.
        </div>
      </div>

      {/* Table Grid */}
      <ResponsiveGrid columns={{ mobile: 1, tablet: 2, desktop: 4 }} className="gap-4">
        {tables.map(table => {
          const cfg = STATUS_CONFIG[table.status] ?? STATUS_CONFIG.occupied;
          const isBusy = actionBusy === table.table_id;
          const hasActiveItems = table.active_item_count > 0 || table.pending_count > 0
            || table.preparing_count > 0 || table.ready_count > 0;

          return (
            <div
              key={table.table_id}
              className={`rounded-2xl border-2 p-5 flex flex-col gap-3 shadow-sm transition-all hover:shadow-md ${cfg.border} ${cfg.bg}`}
            >
              {/* Table number + status badge */}
              <div className="flex items-center justify-between">
                <span className="text-2xl font-black text-gray-800">T{table.table_number}</span>
                <span className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border ${cfg.color} ${cfg.border} bg-white`}>
                  {cfg.icon}
                  {cfg.label}
                </span>
              </div>

              {/* Bill-paid warning (RULE 2 visual) */}
              {table.is_bill_paid && hasActiveItems && (
                <div className="rounded-lg bg-orange-100 border border-orange-300 px-3 py-2 text-xs font-semibold text-orange-800 flex items-center gap-1.5">
                  <AlertTriangle size={12} />
                  Bill Paid — Waiting for kitchen/service completion
                </div>
              )}

              {/* Item counts */}
              {table.status !== 'free' && (
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg bg-white/80 border px-2 py-1.5 text-center">
                    <div className="font-black text-gray-800">{table.pending_count ?? 0}</div>
                    <div className="text-gray-500">Pending</div>
                  </div>
                  <div className="rounded-lg bg-white/80 border px-2 py-1.5 text-center">
                    <div className="font-black text-blue-600">{table.preparing_count ?? 0}</div>
                    <div className="text-gray-500">Preparing</div>
                  </div>
                  <div className="rounded-lg bg-white/80 border px-2 py-1.5 text-center">
                    <div className="font-black text-amber-600">{table.ready_count ?? 0}</div>
                    <div className="text-gray-500">Ready</div>
                  </div>
                </div>
              )}

              {/* Bills info */}
              {table.status !== 'free' && (
                <div className="text-xs text-gray-500 flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <CreditCard size={11} />
                    Bills: <strong className="text-gray-700">{table.paid_bills ?? 0} paid</strong>
                    {(table.unpaid_bills ?? 0) > 0 && (
                      <span className="text-red-600 font-bold">/ {table.unpaid_bills} unpaid</span>
                    )}
                  </span>
                </div>
              )}

              {/* Occupied since */}
              {table.occupied_since && (
                <div className="text-[11px] text-gray-400 flex items-center gap-1">
                  <Clock size={10} />
                  Since {new Date(table.occupied_since).toLocaleTimeString('en-IN', {
                    hour: '2-digit', minute: '2-digit',
                  })}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-auto pt-2">
                {(table.status === 'waiting_for_service_completion' || table.status === 'ready_to_free') && (
                  <Button
                    size="sm"
                    className="flex-1 rounded-lg text-xs h-11 md:h-9"
                    disabled={isBusy}
                    onClick={() => handleFreeTable(table)}
                  >
                    {isBusy
                      ? <Loader2 size={12} className="animate-spin mr-1" />
                      : <Unlock size={12} className="mr-1" />}
                    Free Table
                  </Button>
                )}
                {/* Admin force-free always available for non-free tables */}
                {table.status !== 'free' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-lg text-xs border-red-200 text-red-600 hover:bg-red-50 h-11 md:h-9 flex-1"
                    disabled={isBusy}
                    onClick={() => setForceFreeTable(table)}
                  >
                    <ShieldAlert size={12} className="mr-1" />
                    Force Free
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </ResponsiveGrid>

      {/* Force Free Dialog */}
      <ForceFreeDialog
        table={forceFreeTable}
        onClose={() => setForceFreeTable(null)}
        onConfirm={reason => forceFreeTable ? handleForceFree(forceFreeTable, reason) : Promise.resolve()}
      />
    </PageContainer>
  );
}
