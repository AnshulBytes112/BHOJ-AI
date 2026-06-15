'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { RoleGuard } from '@/components/auth/role-guard';
import { PageContainer } from '@/components/common/page-container';
import { ResponsiveTable } from '@/components/common/responsive-table';
import { MobileDrawer } from '@/components/common/mobile-drawer';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Bell, Plus, Calendar, RotateCcw, Filter, Search, Eye, Printer, X, Clock, CreditCard, ChevronLeft, ChevronRight, LayoutList, CheckSquare, XCircle } from 'lucide-react';
import apiClient from '@/services/apiClient';
import { cn } from '@/lib/utils';

type OrderItem = { order_item_id?: string; item_id: string; item_name: string; quantity: number; price_at_billing: number; };
type Order = { order_id: string; table_id: string; table_number?: string; order_phase: number; status: string; items: OrderItem[]; created_at?: string; order_type?: string; payment_option?: string; notes?: string; };

// Safe helpers
const safeItems = (items: any): OrderItem[] => Array.isArray(items) ? items : [];
const calcTotal = (items: any): number => safeItems(items).reduce((s, i) => s + (i.quantity || 0) * (Number(i.price_at_billing) || 0), 0);
const shortId = (id?: string) => id ? id.slice(0, 8).toUpperCase() : '—';
const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

export default function OrdersPage() {
  const columns = [
    {
      header: 'Order ID',
      accessor: (row: Order) => (
        <span className="font-medium text-primary uppercase">{shortId(row.order_id)}</span>
      ),
    },
    {
      header: 'Table No.',
      accessor: (row: Order) => row.table_number || row.table_id,
    },
    {
      header: 'Status',
      accessor: (row: Order) => statusBadge(row.status),
    },
    {
      header: 'Order Time',
      accessor: (row: Order) => fmtDate(row.created_at),
      className: 'text-sm',
    },
    {
      header: 'Items',
      accessor: (row: Order) => `${safeItems(row.items).length} Items`,
    },
    {
      header: 'Amount (₹)',
      accessor: (row: Order) => `₹ ${calcTotal(row.items).toFixed(2)}`,
      className: 'font-semibold',
    },
    {
      header: 'Payment',
      accessor: (row: Order) => {
        if (row.status === 'cancelled') return null;
        return row.status === 'billed' || row.status === 'completed'
          ? <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">✓ Paid</Badge>
          : <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs">⏳ Unpaid</Badge>;
      },
    },
    {
      header: 'Actions',
      accessor: (row: Order) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:bg-primary/10"
            title="View Details" onClick={e => { e.stopPropagation(); setSelected(row); }}>
            <Eye className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:bg-blue-50"
            title="Print KOT" onClick={e => { e.stopPropagation(); openKOT(row); }}>
            <Printer className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  const mobileCardRender = (order: Order) => (
    <div className="space-y-3" onClick={() => setSelected(order)}>
      <div className="flex justify-between items-center border-b pb-2">
        <span className="font-bold text-primary uppercase text-sm">#{shortId(order.order_id)}</span>
        <div className="flex gap-2">
          {statusBadge(order.status)}
          {order.status !== 'cancelled' && (
            order.status === 'billed' || order.status === 'completed'
              ? <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Paid</Badge>
              : <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs">Unpaid</Badge>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
        <div>
          <span className="text-gray-400 block text-[9px] uppercase tracking-wider">Table No.</span>
          <span className="font-medium">Table {order.table_number || order.table_id}</span>
        </div>
        <div>
          <span className="text-gray-400 block text-[9px] uppercase tracking-wider">Order Time</span>
          <span className="font-medium">{fmtDate(order.created_at)}</span>
        </div>
        <div>
          <span className="text-gray-400 block text-[9px] uppercase tracking-wider">Items Count</span>
          <span className="font-medium">{safeItems(order.items).length} items</span>
        </div>
        <div>
          <span className="text-gray-400 block text-[9px] uppercase tracking-wider">Amount</span>
          <span className="font-bold text-blue-600">₹ {calcTotal(order.items).toFixed(2)}</span>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t pt-2 mt-2">
        <Button variant="outline" size="sm" className="h-10 px-3 gap-1" onClick={e => { e.stopPropagation(); setSelected(order); }}>
          <Eye className="w-4 h-4" /> Details
        </Button>
        <Button variant="outline" size="sm" className="h-10 px-3 gap-1 text-blue-600 border-blue-100 bg-blue-50/50" onClick={e => { e.stopPropagation(); openKOT(order); }}>
          <Printer className="w-4 h-4" /> Print KOT
        </Button>
      </div>
    </div>
  );

  const router = useRouter();
  const dateInputRef = useRef<HTMLInputElement>(null);
  const today = new Date().toISOString().split('T')[0];

  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<Order | null>(null);
  const [activeTab, setActiveTab] = useState('all');

  // Filters
  const [filterDate, setFilterDate] = useState(today);
  const [filterTable, setFilterTable] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPayment, setFilterPayment] = useState('all');
  const [filterSearch, setFilterSearch] = useState('');
  const [applied, setApplied] = useState({ date: today, table: 'all', status: 'all', payment: 'all', search: '' });

  // Pagination
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Action state
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [kotOpen, setKotOpen] = useState(false);
  const [kotOrder, setKotOrder] = useState<Order | null>(null);
  const [billOpen, setBillOpen] = useState(false);
  const [billOrder, setBillOrder] = useState<Order | null>(null);

  useEffect(() => { 
    load(); 
    
    // Auto-refresh orders every 5 seconds for real-time updates
    const interval = setInterval(() => {
      load(true);
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  async function load(silent = false) {
    if (!silent) { setIsLoading(true); setErrorMsg(null); }
    try {
      // Fetch both orders and KOTs to manually sync status on the frontend
      // as a fallback while the backend is deploying.
      const [r, kotsRes] = await Promise.all([
        apiClient.get<Order[]>('/orders'),
        apiClient.get<any[]>('/kots').catch(() => ({ data: [] }))
      ]);
      
      const allKots = kotsRes.data || [];
      
      const data = (r.data ?? []).map(o => {
        let currentStatus = o.status;
        
        // Find all KOTs for this order
        const orderKots = allKots.filter((k: any) => k.order_id === o.order_id);
        
        if (orderKots.length > 0) {
          if (orderKots.every((k: any) => k.status === 'completed')) {
            currentStatus = 'completed';
          } else if (orderKots.some((k: any) => k.status === 'acknowledged')) {
            currentStatus = 'in_progress';
          }
        }
        
        return { 
          ...o, 
          status: currentStatus,
          items: safeItems(o.items) 
        };
      });
      
      setOrders(data);
      // Update selected order if it exists, but don't auto-select/open if it is closed
      if (data.length > 0) {
        setSelected(prev => {
          if (!prev) return null;
          const updated = data.find(o => o.order_id === prev.order_id);
          return updated || prev;
        });
      }
    } catch (e: any) {
      if (!silent) setErrorMsg(e?.response?.data?.message || 'Failed to load orders.');
    } finally { 
      if (!silent) setIsLoading(false); 
    }
  }

  function openKOT(o: Order) { setKotOrder(o); setSelected(o); setKotOpen(true); }
  function openBill(o: Order) {
    if (safeItems(o.items).length === 0) { setActionMsg('No items in this order.'); return; }
    setBillOrder(o); setSelected(o); setBillOpen(true);
  }

  async function sendToKitchen(o: Order) {
    if (o.status !== 'open') { openKOT(o); return; }
    setIsSending(true); setActionMsg(null);
    try {
      await apiClient.post(`/orders/${o.order_id}/send-to-kitchen`);
      setActionMsg('Sent to kitchen!');
      await load();
    } catch (e: any) { setActionMsg(e?.response?.data?.message || 'Failed.'); }
    finally { setIsSending(false); }
    openKOT(o);
  }

  const statusBadge = (s: string) => {
    if (s === 'open') return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">New</Badge>;
    if (s === 'sent_to_kitchen') return <Badge className="bg-orange-100 text-orange-700 border-orange-200">Pending</Badge>;
    if (s === 'in_progress') return <Badge className="bg-blue-100 text-blue-700 border-blue-200">In Progress</Badge>;
    if (s === 'ready') return <Badge className="bg-teal-100 text-teal-700 border-teal-200">Ready</Badge>;
    if (s === 'completed') return <Badge className="bg-green-100 text-green-700 border-green-200">Completed</Badge>;
    if (s === 'billed') return <Badge className="bg-purple-100 text-purple-700 border-purple-200">Billed</Badge>;
    if (s === 'cancelled') return <Badge className="bg-red-100 text-red-700 border-red-200">Cancelled</Badge>;
    return <Badge variant="secondary">{s}</Badge>;
  };

  const uniqueTables = useMemo(() => [...new Set(orders.map(o => o.table_number || o.table_id).filter(Boolean))], [orders]);

  const filtered = useMemo(() => {
    let list = orders;
    if (activeTab === 'running') list = list.filter(o => o.status === 'open' || o.status === 'sent_to_kitchen' || o.status === 'in_progress' || o.status === 'ready');
    else if (activeTab === 'completed') list = list.filter(o => o.status === 'completed' || o.status === 'billed');
    else if (activeTab === 'cancelled') list = list.filter(o => o.status === 'cancelled');
    if (applied.table !== 'all') list = list.filter(o => (o.table_number || o.table_id) === applied.table);
    if (applied.status !== 'all') {
      if (applied.status === 'running') list = list.filter(o => o.status === 'open' || o.status === 'sent_to_kitchen' || o.status === 'in_progress' || o.status === 'ready');
      else if (applied.status === 'completed') list = list.filter(o => o.status === 'completed' || o.status === 'billed');
      else if (applied.status === 'cancelled') list = list.filter(o => o.status === 'cancelled');
    }
    if (applied.payment !== 'all') {
      if (applied.payment === 'unpaid') list = list.filter(o => o.status !== 'billed' && o.status !== 'completed');
      else if (applied.payment === 'paid') list = list.filter(o => o.status === 'billed' || o.status === 'completed');
    }
    if (applied.date) list = list.filter(o => !o.created_at || new Date(o.created_at).toISOString().split('T')[0] === applied.date);
    if (applied.search) {
      const q = applied.search.toLowerCase();
      list = list.filter(o => (o.order_id || '').toLowerCase().includes(q) || (o.table_number || o.table_id || '').toLowerCase().includes(q));
    }
    return list;
  }, [orders, activeTab, applied]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const paged = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const TAB = (id: string, label: string, icon: React.ReactNode) => (
    <button onClick={() => { setActiveTab(id); setPage(1); }}
      className={cn("flex items-center gap-2 px-1 py-4 text-sm font-medium border-b-2 transition-colors",
        activeTab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
      {icon} {label}
    </button>
  );

  // Bill computation
  const billSubtotal = calcTotal(billOrder?.items);
  const billCGST = billSubtotal * 0.025;
  const billSGST = billSubtotal * 0.025;
  const billTotal = billSubtotal + billCGST + billSGST;

  // Detail panel computation
  const detSubtotal = calcTotal(selected?.items);
  const detCGST = detSubtotal * 0.025;
  const detSGST = detSubtotal * 0.025;
  const detTotal = detSubtotal + detCGST + detSGST;

  return (
    <RoleGuard allowedRoles={['superadmin', 'admin', 'manager', 'staff']}>
      <DashboardLayout>
        <PageContainer className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Orders</h1>
              <p className="text-sm text-muted-foreground">View and manage all restaurant orders</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex items-center gap-2 bg-white border rounded-md px-3 py-2 text-sm shadow-sm cursor-pointer hover:border-primary/50 h-11"
                onClick={() => dateInputRef.current?.showPicker()}>
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span>{new Date(filterDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                <input ref={dateInputRef} type="date" value={filterDate}
                  onChange={e => { setFilterDate(e.target.value); setApplied(f => ({ ...f, date: e.target.value })); setPage(1); }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full" />
              </div>
              <Button className="bg-primary hover:bg-primary/90 text-white gap-2 h-11" onClick={() => router.push('/admin/pos')}>
                <Plus className="w-4 h-4" /> New Order
              </Button>
            </div>
          </div>

          {errorMsg && <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{errorMsg}</div>}

          <div className="bg-white shadow-sm ring-1 ring-border rounded-xl overflow-hidden">
            {/* Tabs */}
            <div className="border-b px-4 flex gap-6 overflow-x-auto scrollbar-none min-w-max">
              {TAB('all', 'All Orders', <LayoutList className="w-4 h-4" />)}
              {TAB('running', 'Running Orders', <Clock className="w-4 h-4" />)}
              {TAB('completed', 'Completed Orders', <CheckSquare className="w-4 h-4" />)}
              {TAB('cancelled', 'Cancelled Orders', <XCircle className="w-4 h-4" />)}
            </div>

            {/* Filters */}
            <div className="p-4 border-b bg-slate-50/50 flex flex-col md:flex-row md:items-end gap-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full md:w-auto">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase">Table</label>
                  <Select value={filterTable} onValueChange={setFilterTable}>
                    <SelectTrigger className="w-full md:w-[130px] bg-white h-11 md:h-10"><SelectValue placeholder="All Tables" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Tables</SelectItem>
                      {uniqueTables.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase">Status</label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-full md:w-[140px] bg-white h-11 md:h-10"><SelectValue placeholder="All Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="running">Running</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 col-span-2 sm:col-span-1">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase">Payment</label>
                  <Select value={filterPayment} onValueChange={setFilterPayment}>
                    <SelectTrigger className="w-full md:w-[140px] bg-white h-11 md:h-10"><SelectValue placeholder="All Payments" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Payments</SelectItem>
                      <SelectItem value="unpaid">⏳ Unpaid</SelectItem>
                      <SelectItem value="paid">✅ Paid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex-1 w-full relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search Order ID / Table" className="pl-9 bg-white h-11 md:h-10 w-full" value={filterSearch}
                  onChange={e => setFilterSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && setApplied({ date: filterDate, table: filterTable, status: filterStatus, payment: filterPayment, search: filterSearch })} />
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <Button variant="outline" className="flex-1 md:flex-initial gap-2 text-primary border-primary/20 h-11 md:h-10" onClick={() => {
                  setFilterDate(today); setFilterTable('all'); setFilterStatus('all'); setFilterPayment('all'); setFilterSearch('');
                  setApplied({ date: today, table: 'all', status: 'all', payment: 'all', search: '' }); setPage(1);
                }}>
                  <RotateCcw className="w-4 h-4" /> Reset
                </Button>
                <Button className="flex-1 md:flex-initial bg-primary hover:bg-primary/90 text-white gap-2 h-11 md:h-10"
                  onClick={() => { setApplied({ date: filterDate, table: filterTable, status: filterStatus, payment: filterPayment, search: filterSearch }); setPage(1); }}>
                  <Filter className="w-4 h-4" /> Filter
                </Button>
              </div>
            </div>

            {/* Orders List Container */}
            <div className="p-4 sm:p-6 bg-slate-50/10">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-800">Orders List</h2>
                <span className="text-xs font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full">Total: {filtered.length}</span>
              </div>
              
              <ResponsiveTable
                data={paged}
                columns={columns}
                rowKey={(row: Order) => row.order_id}
                mobileCardRender={mobileCardRender}
                loading={isLoading}
                onRowClick={setSelected}
              />

              {/* Pagination */}
              <div className="p-4 border border-t-0 rounded-b-xl bg-white flex flex-col sm:flex-row gap-4 items-center justify-between text-sm text-muted-foreground shadow-sm">
                <span>Showing {filtered.length === 0 ? 0 : (page - 1) * rowsPerPage + 1}–{Math.min(page * rowsPerPage, filtered.length)} of {filtered.length}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="icon" className="w-8 h-8" disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).slice(Math.max(0, page - 2), page + 1).map(p =>
                    <Button key={p} variant="outline" size="icon" className={cn("w-8 h-8", p === page && "border-primary text-primary bg-primary/5")} onClick={() => setPage(p)}>{p}</Button>)}
                  <Button variant="outline" size="icon" className="w-8 h-8" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
                  <Select value={String(rowsPerPage)} onValueChange={v => { setRowsPerPage(Number(v)); setPage(1); }}>
                    <SelectTrigger className="w-[70px] h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>{[10, 20, 50].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Slider Drawer for Details (Desktop and Mobile) */}
            <MobileDrawer
              isOpen={!!selected}
              onClose={() => setSelected(null)}
              title="Order Details"
              size="lg"
              footer={selected && (
                <div className="flex gap-3 w-full">
                   <Button variant="outline" className="flex-1 text-primary border-primary/30 bg-primary/5 hover:bg-primary/10 h-11"
                    disabled={
                      isSending || 
                      selected.status === 'in_progress' || 
                      selected.status === 'ready' || 
                      selected.status === 'completed' || 
                      selected.status === 'billed' || 
                      selected.status === 'cancelled'
                    } 
                    onClick={() => sendToKitchen(selected)}
                  >
                    <Printer className="w-4 h-4 mr-2" />
                    {isSending ? 'Sending...' : 
                     selected.status === 'open' ? 'Send to Kitchen' : 
                     selected.status === 'in_progress' ? 'Preparing in Kitchen' :
                     selected.status === 'ready' ? 'Food Ready' :
                     selected.status === 'completed' ? 'KOT Printed' : 
                     selected.status === 'billed' ? 'Order Billed' : 'Print KOT'}
                  </Button>
                  <Button className="flex-1 bg-primary hover:bg-primary/90 text-white h-11"
                    disabled={selected.status === 'billed'} onClick={() => openBill(selected)}>
                    <CreditCard className="w-4 h-4 mr-2" /> Generate Bill
                  </Button>
                </div>
              )}
            >
              {selected && (
                <div className="space-y-6">
                  {/* Order metadata card */}
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Order ID</span>
                      <h3 className="font-bold text-slate-800 text-lg uppercase">{shortId(selected.order_id)}</h3>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block text-right">Status</span>
                      {statusBadge(selected.status)}
                    </div>
                  </div>

                  {actionMsg && (
                    <div className="rounded-lg bg-blue-50 border border-blue-100 text-blue-700 px-3 py-2 text-sm">
                      {actionMsg}
                    </div>
                  )}

                  {/* Stepper progress tracker */}
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                    <div className="flex items-center justify-between text-xs font-medium text-slate-400 mb-2">
                      <span>ORDER PROGRESS</span>
                      <span className="text-primary uppercase font-bold">{selected.status.replace('_', ' ')}</span>
                    </div>
                    <div className="relative flex items-center justify-between mt-4 px-2">
                      {/* Progress Line */}
                      <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-0.5 bg-slate-200 z-0" />
                      <div 
                        className="absolute left-6 top-1/2 -translate-y-1/2 h-0.5 bg-primary transition-all duration-300 z-0" 
                        style={{ 
                          width: `${
                            selected.status === 'open' ? '0%' :
                            selected.status === 'sent_to_kitchen' ? '25%' :
                            selected.status === 'in_progress' ? '50%' :
                            selected.status === 'completed' ? '75%' :
                            selected.status === 'billed' ? '100%' : '0%'
                          }` 
                        }} 
                      />

                      {/* Steps */}
                      {[
                        { label: 'New', key: 'open' },
                        { label: 'KOT Sent', key: 'sent_to_kitchen' },
                        { label: 'Preparing', key: 'in_progress' },
                        { label: 'Completed', key: 'completed' },
                        { label: 'Billed', key: 'billed' }
                      ].map((step, idx) => {
                        const statuses = ['open', 'sent_to_kitchen', 'in_progress', 'completed', 'billed'];
                        const currentIdx = statuses.indexOf(selected.status);
                        const stepIdx = statuses.indexOf(step.key);
                        const isDone = stepIdx <= currentIdx;
                        const isCurrent = stepIdx === currentIdx;

                        return (
                          <div key={idx} className="flex flex-col items-center relative z-10">
                            <div className={cn(
                              "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300",
                              isCurrent ? "bg-primary text-white ring-4 ring-primary/20 scale-110" :
                              isDone ? "bg-primary text-white" : "bg-slate-100 text-slate-400 border border-slate-200"
                            )}>
                              {idx + 1}
                            </div>
                            <span className={cn(
                              "text-[9px] mt-1 font-semibold whitespace-nowrap",
                              isCurrent ? "text-primary font-bold" :
                              isDone ? "text-slate-700" : "text-slate-400"
                            )}>
                              {step.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Order info details */}
                  <div className="bg-white border rounded-xl p-4 shadow-sm grid grid-cols-2 gap-y-3 text-sm">
                    <div className="text-slate-500">Table</div>
                    <div className="font-semibold text-right text-slate-800">Table {selected.table_number || selected.table_id}</div>
                    
                    <div className="text-slate-500">Order Type</div>
                    <div className="font-semibold text-right text-slate-800">
                      <Badge variant="secondary" className={selected.order_type === 'Take Away' ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}>
                        {selected.order_type || 'Dine In'}
                      </Badge>
                    </div>
                    
                    <div className="text-slate-500">Payment Pref</div>
                    <div className="font-semibold text-right text-slate-800">{selected.payment_option || 'Pay at Restaurant'}</div>

                    <div className="text-slate-500">Order Time</div>
                    <div className="font-medium text-right text-slate-600">{fmtDate(selected.created_at)}</div>
                    
                    <div className="text-slate-500">Payment Status</div>
                    <div className="text-right">
                      {selected.status === 'cancelled' ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <Badge variant="outline" className={selected.status === 'billed' || selected.status === 'completed' ? "bg-green-50 text-green-700 border-green-200" : "bg-orange-50 text-orange-700 border-orange-200"}>
                          {selected.status === 'billed' || selected.status === 'completed' ? 'Paid' : 'Unpaid'}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Special Instructions (Notes) */}
                  {selected.notes && (
                    <div className="bg-yellow-50/50 border border-yellow-250 rounded-xl p-4 text-sm">
                      <div className="font-bold text-yellow-800 mb-1 flex items-center gap-1.5">
                        <span>⚠️ Special Instructions:</span>
                      </div>
                      <p className="text-slate-700 italic font-medium">{selected.notes}</p>
                    </div>
                  )}

                  {/* Order items list */}
                  <div>
                    <h4 className="font-bold text-slate-700 text-sm mb-3">Order Items ({safeItems(selected.items).length})</h4>
                    <div className="border rounded-xl divide-y bg-white overflow-hidden shadow-sm">
                      {safeItems(selected.items).length === 0 ? (
                        <p className="text-sm text-muted-foreground p-4 text-center">No items in this order</p>
                      ) : (
                        safeItems(selected.items).map((item, i) => (
                          <div key={i} className="flex justify-between items-center p-3 text-sm hover:bg-slate-50/50">
                            <div className="flex-1">
                              <span className="font-semibold text-slate-800">{item.item_name || `Item #${item.item_id}`}</span>
                              <span className="block text-xs text-slate-400">Qty: {item.quantity} × ₹{Number(item.price_at_billing).toFixed(2)}</span>
                            </div>
                            <span className="font-bold text-slate-700 text-right">₹{(item.quantity * Number(item.price_at_billing)).toFixed(2)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Pricing summaries formatted like a receipt */}
                  <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4 space-y-2.5 text-sm">
                    <div className="flex justify-between text-slate-500">
                      <span>Subtotal</span>
                      <span className="font-medium">₹ {detSubtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>CGST (2.5%)</span>
                      <span className="font-medium">₹ {detCGST.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>SGST (2.5%)</span>
                      <span className="font-medium">₹ {detSGST.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2.5 border-t border-dashed border-slate-200 font-bold text-slate-800 text-base">
                      <span>Total Amount</span>
                      <span className="text-primary text-lg font-bold">₹ {detTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}
            </MobileDrawer>
          </div>
        </PageContainer>

        {/* KOT Dialog */}
        <Dialog open={kotOpen} onOpenChange={setKotOpen}>
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
            {kotOrder && (
              <div className="flex flex-col gap-0 font-mono text-sm" style={{ fontSize: '12px', lineHeight: '1.6' }}>
                {/* KOT label */}
                <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '13px', marginBottom: '6px', letterSpacing: '2px' }}>
                  KITCHEN ORDER TICKET
                </div>

                {/* Order info - left aligned */}
                <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '8px' }}>
                  <div>ORDER NO: #{shortId(kotOrder.order_id)}</div>
                  <div>TYPE: {(kotOrder.order_type || 'Dine In').toUpperCase()}</div>
                  <div>TABLE: {kotOrder.table_number || kotOrder.table_id}</div>
                  <div style={{ fontWeight: 'normal', fontSize: '12px' }}>DATE & TIME:{fmtDate(kotOrder.created_at)}</div>
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
                  {safeItems(kotOrder.items).map((item, i) => (
                    <div key={i} className="flex" style={{ marginBottom: '4px' }}>
                      <span style={{ flex: 3, textAlign: 'left' }}>{item.item_name || `Item #${item.item_id}`}</span>
                      <span style={{ flex: 1, textAlign: 'right', fontWeight: 'bold' }}>{item.quantity}</span>
                    </div>
                  ))}
                </div>

                {/* Dashed separator */}
                <div style={{ borderBottom: '1px dashed #000', marginBottom: '8px' }} />

                {/* Special Instructions */}
                {kotOrder.notes && (
                  <>
                    <div style={{ border: '1px solid #000', padding: '6px', marginBottom: '8px', fontSize: '11px', backgroundColor: '#f9f9f9', fontFamily: 'monospace' }}>
                      <strong>INSTRUCTIONS:</strong> {kotOrder.notes}
                    </div>
                    <div style={{ borderBottom: '1px dashed #000', marginBottom: '8px' }} />
                  </>
                )}

                {/* Status */}
                <div style={{ textAlign: 'center', fontSize: '11px', marginBottom: '8px' }}>
                  Status: <strong>{(kotOrder.status || '').replace('_', ' ').toUpperCase()}</strong>
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
              <Button variant="outline" onClick={() => setKotOpen(false)}>Close</Button>
              <Button className="bg-primary text-white hover:bg-primary/90 gap-2" onClick={() => window.print()}>
                <Printer className="w-4 h-4" /> Print KOT
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bill Dialog */}
        <Dialog open={billOpen} onOpenChange={setBillOpen}>
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
              <DialogDescription className="sr-only">Bill Receipt</DialogDescription>
            </DialogHeader>
            {billOrder && (
              <div className="flex flex-col gap-0 font-mono text-sm" style={{ fontSize: '12px', lineHeight: '1.6' }}>
                {/* Order info - left aligned */}
                <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '8px' }}>
                  <div>ORDER NO: #{shortId(billOrder.order_id)}</div>
                  <div>TABLE: {billOrder.table_number || billOrder.table_id}</div>
                  <div style={{ fontWeight: 'normal', fontSize: '12px' }}>DATE & TIME:{fmtDate(billOrder.created_at)}</div>
                </div>

                {/* Dashed separator */}
                <div style={{ borderBottom: '1px dashed #000', marginBottom: '8px' }} />

                {/* Items header */}
                <div className="flex" style={{ marginBottom: '4px', fontWeight: 'bold', fontSize: '11px' }}>
                  <span style={{ flex: 2, textAlign: 'left' }}>ITEM</span>
                  <span style={{ flex: 0.5, textAlign: 'center' }}>QTY</span>
                  <span style={{ flex: 1, textAlign: 'right' }}>PRICE</span>
                  <span style={{ flex: 1, textAlign: 'right' }}>TOTAL</span>
                </div>

                {/* Dashed separator */}
                <div style={{ borderBottom: '1px dashed #000', marginBottom: '6px' }} />

                {/* Items */}
                <div style={{ marginBottom: '8px' }}>
                  {safeItems(billOrder.items).map((item, i) => (
                    <div key={i} className="flex" style={{ marginBottom: '4px' }}>
                      <span style={{ flex: 2, textAlign: 'left' }}>{item.item_name || `Item #${item.item_id}`}</span>
                      <span style={{ flex: 0.5, textAlign: 'center' }}>{item.quantity}</span>
                      <span style={{ flex: 1, textAlign: 'right' }}>{Number(item.price_at_billing).toFixed(2)}</span>
                      <span style={{ flex: 1, textAlign: 'right', fontWeight: 'bold' }}>{(item.quantity * Number(item.price_at_billing)).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                {/* Dashed separator */}
                <div style={{ borderBottom: '1px dashed #000', marginBottom: '8px' }} />

                {/* Totals */}
                <div style={{ fontSize: '13px' }}>
                  <div className="flex justify-between" style={{ marginBottom: '4px' }}>
                    <span>Subtotal</span>
                    <span>Rs {billSubtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between" style={{ marginBottom: '2px' }}>
                    <span>CGST (2.5%)</span>
                    <span>Rs {billCGST.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between" style={{ marginBottom: '8px' }}>
                    <span>SGST (2.5%)</span>
                    <span>Rs {billSGST.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between" style={{
                    fontWeight: 'bold',
                    fontSize: '15px',
                    borderTop: '1px dashed #000',
                    paddingTop: '8px',
                  }}>
                    <span>GRAND TOTAL</span>
                    <span>Rs {billTotal.toFixed(2)}</span>
                  </div>
                </div>

                {/* Footer */}
                <div style={{
                  textAlign: 'center',
                  borderTop: '1px dashed #000',
                  paddingTop: '12px',
                  marginTop: '12px',
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
              <Button variant="outline" onClick={() => setBillOpen(false)}>Close</Button>
              <Button className="bg-primary text-white hover:bg-primary/90 gap-2" onClick={() => window.print()}>
                <Printer className="w-4 h-4" /> Print Bill
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </DashboardLayout>
    </RoleGuard>
  );
}
