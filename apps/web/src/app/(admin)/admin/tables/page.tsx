'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { RoleGuard } from '@/components/auth/role-guard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ResponsiveTable } from '@/components/common/responsive-table';
import { ResponsiveForm } from '@/components/common/responsive-form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, RefreshCw, TableIcon } from 'lucide-react';
import apiClient from '@/services/apiClient';

type TableRow = { table_id: string; table_number: string; status: 'free' | 'occupied' | 'billed'; created_at?: string; };

export default function TablesPage() {
  const [tables, setTables] = useState<TableRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newTableNumber, setNewTableNumber] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => { loadTables(); }, []);

  async function loadTables() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<TableRow[]>('/tables');
      setTables((res.data ?? []).sort((a, b) => Number(a.table_number) - Number(b.table_number)));
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load tables.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAddTable(e: React.FormEvent) {
    e.preventDefault();
    if (!newTableNumber.trim()) return;
    setIsAdding(true);
    setError(null);
    setSuccess(null);
    try {
      await apiClient.post('/tables', { table_number: newTableNumber.trim() });
      setSuccess(`Table ${newTableNumber} added!`);
      setNewTableNumber('');
      await loadTables();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to add table.');
    } finally {
      setIsAdding(false);
    }
  }

  async function handleSeedTables() {
    setIsAdding(true);
    setError(null);
    setSuccess(null);
    try {
      await Promise.allSettled(
        Array.from({ length: 10 }, (_, i) =>
          apiClient.post('/tables', { table_number: String(i + 1) })
        )
      );
      setSuccess('Tables 1–10 seeded!');
      await loadTables();
    } catch (e: any) {
      setError('Some tables may already exist.');
      await loadTables();
    } finally {
      setIsAdding(false);
    }
  }

  async function handleDelete(tableId: string, tableNumber: string) {
    if (!confirm(`Delete Table ${tableNumber}?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await apiClient.delete(`/tables/${tableId}`);
      setSuccess(`Table ${tableNumber} deleted.`);
      await loadTables();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Cannot delete occupied table.');
    }
  }

  const statusBadge = (status: string) => {
    if (status === 'free') return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Free</Badge>;
    if (status === 'occupied') return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Occupied</Badge>;
    if (status === 'billing_done') return <Badge className="bg-purple-100 text-purple-700 border-purple-200">Bill Generated</Badge>;
    if (status === 'waiting_for_service_completion') return <Badge className="bg-orange-100 text-orange-700 border-orange-200">Waiting for Service</Badge>;
    if (status === 'ready_to_free') return <Badge className="bg-green-100 text-green-700 border-green-200">Ready to Free</Badge>;
    return <Badge className="bg-slate-100 text-slate-700 border-slate-200">{status}</Badge>;
  };

  return (
    <RoleGuard allowedRoles={['superadmin', 'admin', 'manager', 'staff']}>
      <DashboardLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <TableIcon className="w-6 h-6 text-primary" /> Tables
              </h1>
              <p className="text-sm text-muted-foreground">Manage restaurant tables</p>
            </div>
            <div className="flex gap-2">
              <a
                href="/admin/tables/status"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-100 text-orange-700 hover:bg-orange-200 text-sm font-semibold transition-colors border border-orange-200"
              >
                📊 Live Table Status View
              </a>
              <Button variant="outline" onClick={loadTables} className="gap-2">
                <RefreshCw className="w-4 h-4" /> Refresh
              </Button>
              <Button onClick={handleSeedTables} disabled={isAdding} className="gap-2 bg-primary text-white hover:bg-primary/90">
                <Plus className="w-4 h-4" /> Seed Tables 1–10
              </Button>
            </div>
          </div>

          {error && <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}
          {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

          {/* Add Table Form */}
          <div className="bg-white border rounded-xl p-5 shadow-sm">
            <h2 className="text-base font-semibold mb-4">Add New Table</h2>
            <ResponsiveForm 
              onSubmit={handleAddTable} 
              className="md:flex-row md:items-end gap-3"
              actions={
                <Button type="submit" disabled={isAdding || !newTableNumber.trim()} className="bg-primary text-white hover:bg-primary/90 gap-2">
                  <Plus className="w-4 h-4" /> Add Table
                </Button>
              }
            >
              <div className="space-y-1 w-full md:w-auto">
                <label className="text-xs font-medium text-muted-foreground uppercase">Table Number</label>
                <Input
                  placeholder="e.g. 11 or VIP-1"
                  value={newTableNumber}
                  onChange={e => setNewTableNumber(e.target.value)}
                  className="w-full md:w-48"
                />
              </div>
            </ResponsiveForm>
          </div>

          {/* Tables List */}
          <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-semibold">All Tables ({tables.length})</h2>
              <span className="text-sm text-muted-foreground">
                Free: {tables.filter(t => t.status === 'free').length} &nbsp;|&nbsp;
                Occupied: {tables.filter(t => t.status === 'occupied').length}
              </span>
            </div>
            <div className="p-4">
              <ResponsiveTable
                data={tables}
                loading={isLoading}
                rowKey={(row) => row.table_id}
                columns={[
                  {
                    header: 'Table Number',
                    accessor: (row: TableRow) => <span className="font-semibold">Table {row.table_number}</span>,
                  },
                  {
                    header: 'Table ID',
                    accessor: (row: TableRow) => <span className="text-xs text-muted-foreground font-mono">{row.table_id}</span>,
                  },
                  {
                    header: 'Status',
                    accessor: (row: TableRow) => statusBadge(row.status),
                  },
                  {
                    header: 'Actions',
                    accessor: (row: TableRow) => (
                      <div className="flex justify-center">
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                          disabled={row.status === 'occupied'}
                          onClick={() => handleDelete(row.table_id, row.table_number)}
                          title={row.status === 'occupied' ? 'Cannot delete occupied table' : 'Delete table'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ),
                    className: 'text-center',
                  }
                ]}
              />
            </div>
          </div>
        </div>
      </DashboardLayout>
    </RoleGuard>
  );
}
