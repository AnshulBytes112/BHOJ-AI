'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { RoleGuard } from '@/components/auth/role-guard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Pencil, Save, AlertTriangle, Layers, Calendar, Utensils, Check, Clock, Trash } from 'lucide-react';
import apiClient from '@/services/apiClient';

type Zone = {
  zone_id: string;
  name: string;
  description: string;
  is_active: boolean;
};

type TableZoneInfo = {
  table_id: string;
  table_number: string;
  zone_id: string | null;
  zone_name: string | null;
};

type ItemPriceOverride = {
  item_id: number;
  item_name: string;
  category: string;
  base_price: string;
  zone_price: string | null;
  override_id?: number;
};

type MenuSchedule = {
  schedule_id: string;
  name: string;
  start_time: string;
  end_time: string;
  days_of_week: number[];
  is_active: boolean;
};

type ItemScheduleOverride = {
  item_id: number;
  item_name: string;
  category: string;
  base_price: string;
  schedule_price: string | null;
  override_id?: number;
};

export default function AdminPricingPage() {
  const [activeTab, setActiveTab] = useState<'zones' | 'zone-overrides' | 'schedules' | 'schedule-overrides'>('zones');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Zones data
  const [zones, setZones] = useState<Zone[]>([]);
  const [isZonesLoading, setIsZonesLoading] = useState(false);
  const [zoneFormOpen, setZoneFormOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [zoneForm, setZoneForm] = useState({ name: '', description: '', is_active: true });

  // Table assignment & overrides data
  const [tables, setTables] = useState<TableZoneInfo[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string>('');
  const [zoneItems, setZoneItems] = useState<ItemPriceOverride[]>([]);
  const [editedZonePrices, setEditedZonePrices] = useState<Record<number, string>>({});
  const [isItemsSaving, setIsItemsSaving] = useState(false);

  // Schedules data
  const [schedules, setSchedules] = useState<MenuSchedule[]>([]);
  const [isSchedulesLoading, setIsSchedulesLoading] = useState(false);
  const [scheduleFormOpen, setScheduleFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<MenuSchedule | null>(null);
  const [scheduleForm, setScheduleForm] = useState({
    name: '',
    start_time: '',
    end_time: '',
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    is_active: true,
  });

  // Schedule overrides data
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('');
  const [scheduleItems, setScheduleItems] = useState<ItemScheduleOverride[]>([]);
  const [editedSchedulePrices, setEditedSchedulePrices] = useState<Record<number, string>>({});

  useEffect(() => {
    loadZones();
    loadTables();
    loadSchedules();
  }, []);

  useEffect(() => {
    if (selectedZoneId) {
      loadZonePrices(selectedZoneId);
    }
  }, [selectedZoneId]);

  useEffect(() => {
    if (selectedScheduleId) {
      loadSchedulePrices(selectedScheduleId);
    }
  }, [selectedScheduleId]);

  // Load functions
  const loadZones = async () => {
    setIsZonesLoading(true);
    try {
      const res = await apiClient.get('/pricing/zones');
      setZones(res.data);
      if (res.data.length > 0 && !selectedZoneId) {
        setSelectedZoneId(res.data[0].zone_id);
      }
    } catch (err: any) {
      setErrorMessage('Failed to load dining zones.');
    } finally {
      setIsZonesLoading(false);
    }
  };

  const loadTables = async () => {
    try {
      const res = await apiClient.get('/pricing/table-zones');
      setTables(res.data);
    } catch (err) {
      console.error('Failed to load table zones', err);
    }
  };

  const loadZonePrices = async (zoneId: string) => {
    try {
      const res = await apiClient.get(`/pricing/zones/${zoneId}/prices`);
      setZoneItems(res.data);
      // Initialize edit state
      const initialEdits: Record<number, string> = {};
      res.data.forEach((item: any) => {
        initialEdits[item.item_id] = item.zone_price !== null ? String(item.zone_price) : '';
      });
      setEditedZonePrices(initialEdits);
    } catch (err) {
      setErrorMessage('Failed to load pricing overrides.');
    }
  };

  const loadSchedules = async () => {
    setIsSchedulesLoading(true);
    try {
      const res = await apiClient.get('/pricing/schedules');
      setSchedules(res.data);
      if (res.data.length > 0 && !selectedScheduleId) {
        setSelectedScheduleId(res.data[0].schedule_id);
      }
    } catch (err) {
      setErrorMessage('Failed to load menu schedules.');
    } finally {
      setIsSchedulesLoading(false);
    }
  };

  const loadSchedulePrices = async (scheduleId: string) => {
    try {
      const res = await apiClient.get(`/pricing/schedules/${scheduleId}/prices`);
      setScheduleItems(res.data);
      const initialEdits: Record<number, string> = {};
      res.data.forEach((item: any) => {
        initialEdits[item.item_id] = item.schedule_price !== null ? String(item.schedule_price) : '';
      });
      setEditedSchedulePrices(initialEdits);
    } catch (err) {
      setErrorMessage('Failed to load schedule price overrides.');
    }
  };

  // Zone CRUD operations
  const handleZoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zoneForm.name.trim()) return;
    try {
      if (editingZone) {
        await apiClient.put(`/pricing/zones/${editingZone.zone_id}`, zoneForm);
        showSuccess('Zone updated successfully.');
      } else {
        await apiClient.post('/pricing/zones', zoneForm);
        showSuccess('Zone created successfully.');
      }
      setZoneFormOpen(false);
      loadZones();
    } catch (err) {
      setErrorMessage('Failed to save dining zone.');
    }
  };

  // Schedule CRUD operations
  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleForm.name.trim() || !scheduleForm.start_time || !scheduleForm.end_time) return;
    try {
      if (editingSchedule) {
        await apiClient.put(`/pricing/schedules/${editingSchedule.schedule_id}`, scheduleForm);
        showSuccess('Schedule updated successfully.');
      } else {
        await apiClient.post('/pricing/schedules', scheduleForm);
        showSuccess('Schedule created successfully.');
      }
      setScheduleFormOpen(false);
      loadSchedules();
    } catch (err) {
      setErrorMessage('Failed to save menu schedule.');
    }
  };

  const handleDeleteZone = async (zoneId: string, zoneName: string) => {
    if (!window.confirm(`Are you sure you want to delete the zone "${zoneName}"? This action cannot be undone.`)) return;
    try {
      await apiClient.delete(`/pricing/zones/${zoneId}`);
      showSuccess('Zone deleted successfully.');
      if (selectedZoneId === zoneId) setSelectedZoneId('');
      loadZones();
      loadTables(); // Reload tables in case their zone was removed
    } catch (err) {
      setErrorMessage('Failed to delete dining zone.');
    }
  };

  const handleDeleteSchedule = async (scheduleId: string, scheduleName: string) => {
    if (!window.confirm(`Are you sure you want to delete the schedule "${scheduleName}"? This action cannot be undone.`)) return;
    try {
      await apiClient.delete(`/pricing/schedules/${scheduleId}`);
      showSuccess('Schedule deleted successfully.');
      if (selectedScheduleId === scheduleId) setSelectedScheduleId('');
      loadSchedules();
    } catch (err) {
      setErrorMessage('Failed to delete menu schedule.');
    }
  };

  // Bulk save Zone overrides
  const handleSaveZonePrices = async () => {
    setIsItemsSaving(true);
    setErrorMessage(null);
    const pricesPayload = Object.entries(editedZonePrices).map(([itemId, val]) => ({
      item_id: Number(itemId),
      price: val.trim() === '' ? null : Number(val),
    }));

    try {
      await apiClient.put(`/pricing/zones/${selectedZoneId}/prices`, { prices: pricesPayload });
      showSuccess('Dining zone pricing overrides updated.');
      loadZonePrices(selectedZoneId);
    } catch (err) {
      setErrorMessage('Failed to update zone prices.');
    } finally {
      setIsItemsSaving(false);
    }
  };

  // Bulk save Schedule overrides
  const handleSaveSchedulePrices = async () => {
    setIsItemsSaving(true);
    setErrorMessage(null);
    const pricesPayload = Object.entries(editedSchedulePrices).map(([itemId, val]) => ({
      item_id: Number(itemId),
      price: val.trim() === '' ? null : Number(val),
    }));

    try {
      await apiClient.put(`/pricing/schedules/${selectedScheduleId}/prices`, { prices: pricesPayload });
      showSuccess('Time-of-day pricing overrides updated.');
      loadSchedulePrices(selectedScheduleId);
    } catch (err) {
      setErrorMessage('Failed to update schedule prices.');
    } finally {
      setIsItemsSaving(false);
    }
  };

  // Assign zone to table
  const handleAssignTableZone = async (tableId: string, zoneId: string | null) => {
    try {
      await apiClient.put('/pricing/table-zones', {
        assignments: [{ table_id: tableId, zone_id: zoneId }],
      });
      loadTables();
      showSuccess('Table zone assignment updated.');
    } catch (err) {
      setErrorMessage('Failed to assign table to zone.');
    }
  };

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  return (
    <RoleGuard allowedRoles={['superadmin', 'admin']}>
      <DashboardLayout>
        <div className="space-y-6 max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
                <Layers className="text-indigo-600" /> Dynamic Pricing
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Configure zone-based overrides, time-of-day scheduled prices, and link tables to zones.
              </p>
            </div>
            <div>
              {activeTab === 'zones' && (
                <Button
                  onClick={() => {
                    setEditingZone(null);
                    setZoneForm({ name: '', description: '', is_active: true });
                    setZoneFormOpen(true);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl gap-2 shadow-sm"
                >
                  <Plus size={16} /> Add Zone
                </Button>
              )}
              {activeTab === 'schedules' && (
                <Button
                  onClick={() => {
                    setEditingSchedule(null);
                    setScheduleForm({
                      name: '',
                      start_time: '',
                      end_time: '',
                      days_of_week: [0, 1, 2, 3, 4, 5, 6],
                      is_active: true,
                    });
                    setScheduleFormOpen(true);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-2 shadow-sm"
                >
                  <Plus size={16} /> Add Schedule
                </Button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-6">
              <button
                onClick={() => setActiveTab('zones')}
                className={`py-3 px-1 border-b-2 font-bold text-sm transition-all flex items-center gap-2 ${
                  activeTab === 'zones'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Layers size={16} /> Dining Zones
              </button>
              <button
                onClick={() => setActiveTab('zone-overrides')}
                className={`py-3 px-1 border-b-2 font-bold text-sm transition-all flex items-center gap-2 ${
                  activeTab === 'zone-overrides'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Utensils size={16} /> Zone Prices & Tables
              </button>
              <button
                onClick={() => setActiveTab('schedules')}
                className={`py-3 px-1 border-b-2 font-bold text-sm transition-all flex items-center gap-2 ${
                  activeTab === 'schedules'
                    ? 'border-emerald-600 text-emerald-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Calendar size={16} /> Time Schedules
              </button>
              <button
                onClick={() => setActiveTab('schedule-overrides')}
                className={`py-3 px-1 border-b-2 font-bold text-sm transition-all flex items-center gap-2 ${
                  activeTab === 'schedule-overrides'
                    ? 'border-emerald-600 text-emerald-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Clock size={16} /> Time-based Prices
              </button>
            </nav>
          </div>

          {/* Messages */}
          {errorMessage && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive font-medium flex items-center gap-2">
              <AlertTriangle size={16} /> {errorMessage}
            </div>
          )}
          {successMessage && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 font-semibold flex items-center gap-2 shadow-sm animate-in fade-in-50">
              <Check size={16} /> {successMessage}
            </div>
          )}

          {/* Tab Content 1: Zones */}
          {activeTab === 'zones' && (
            <Card className="border bg-white shadow-sm rounded-2xl overflow-hidden">
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-gray-50/75">
                    <TableRow>
                      <TableHead className="font-bold text-gray-700">Zone Name</TableHead>
                      <TableHead className="font-bold text-gray-700">Description</TableHead>
                      <TableHead className="font-bold text-gray-700">Status</TableHead>
                      <TableHead className="text-right font-bold text-gray-700">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isZonesLoading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          Loading dining zones...
                        </TableCell>
                      </TableRow>
                    ) : zones.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          No dining zones configured. Click "Add Zone" to start.
                        </TableCell>
                      </TableRow>
                    ) : (
                      zones.map((zone) => (
                        <TableRow key={zone.zone_id}>
                          <TableCell className="font-bold text-gray-800">{zone.name}</TableCell>
                          <TableCell className="text-gray-600 max-w-xs truncate">{zone.description || '—'}</TableCell>
                          <TableCell>
                            <Badge variant={zone.is_active ? 'default' : 'secondary'} className={zone.is_active ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-50' : ''}>
                              {zone.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingZone(zone);
                                  setZoneForm({
                                    name: zone.name,
                                    description: zone.description || '',
                                    is_active: zone.is_active,
                                  });
                                  setZoneFormOpen(true);
                                }}
                                className="text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl"
                              >
                                <Pencil size={14} className="mr-1" /> Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteZone(zone.zone_id, zone.name)}
                                className="text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl"
                              >
                                <Trash size={14} className="mr-1" /> Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Tab Content 2: Zone Overrides & Table Mapping */}
          {activeTab === 'zone-overrides' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Tables assignment */}
              <Card className="border bg-white shadow-sm rounded-2xl">
                <CardHeader className="border-b">
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    Table Zone Assignments
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Link tables to dining zones. Scanned QR codes automatically resolve pricing based on these assignments.
                  </p>
                  <div className="divide-y max-h-[500px] overflow-y-auto pr-1">
                    {tables.map((tbl) => (
                      <div key={tbl.table_id} className="py-3 flex items-center justify-between gap-3">
                        <span className="font-bold text-sm text-gray-800">Table {tbl.table_number}</span>
                        <select
                          className="h-8 rounded-lg border border-input bg-background px-2 text-xs font-semibold focus:ring-1 focus:ring-indigo-500"
                          value={tbl.zone_id || ''}
                          onChange={(e) => handleAssignTableZone(tbl.table_id, e.target.value || null)}
                        >
                          <option value="">Base Menu (No Zone)</option>
                          {zones.map((z) => (
                            <option key={z.zone_id} value={z.zone_id}>{z.name}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Right Column: Pricing Overrides */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-700">Active Zone:</span>
                    <select
                      className="h-9 rounded-lg border border-input bg-white px-3 text-sm font-bold text-indigo-700 focus:ring-2 focus:ring-indigo-500"
                      value={selectedZoneId}
                      onChange={(e) => setSelectedZoneId(e.target.value)}
                    >
                      {zones.map((z) => (
                        <option key={z.zone_id} value={z.zone_id}>{z.name}</option>
                      ))}
                    </select>
                  </div>
                  <Button
                    onClick={handleSaveZonePrices}
                    disabled={isItemsSaving || !selectedZoneId}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl gap-2 shadow-sm font-semibold shrink-0"
                  >
                    <Save size={16} /> Save Overrides
                  </Button>
                </div>

                <Card className="border bg-white shadow-sm rounded-2xl overflow-hidden">
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader className="bg-gray-50/75">
                        <TableRow>
                          <TableHead className="font-bold text-gray-700">Item Name</TableHead>
                          <TableHead className="font-bold text-gray-700">Category</TableHead>
                          <TableHead className="font-bold text-gray-700">Base Price (Rs)</TableHead>
                          <TableHead className="font-bold text-gray-700 w-36">Zone Price (Rs)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {zoneItems.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                              Select a zone to view items.
                            </TableCell>
                          </TableRow>
                        ) : (
                          zoneItems.map((item) => (
                            <TableRow key={item.item_id}>
                              <TableCell className="font-bold text-gray-800">{item.item_name}</TableCell>
                              <TableCell className="text-gray-500 text-xs font-semibold">{item.category}</TableCell>
                              <TableCell className="font-semibold text-gray-600">{Number(item.base_price).toFixed(2)}</TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="Use Base"
                                  className="h-8 rounded-lg text-xs font-bold text-gray-800"
                                  value={editedZonePrices[item.item_id] ?? ''}
                                  onChange={(e) =>
                                    setEditedZonePrices({
                                      ...editedZonePrices,
                                      [item.item_id]: e.target.value,
                                    })
                                  }
                                />
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Tab Content 3: Schedules */}
          {activeTab === 'schedules' && (
            <Card className="border bg-white shadow-sm rounded-2xl overflow-hidden">
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-gray-50/75">
                    <TableRow>
                      <TableHead className="font-bold text-gray-700">Schedule Name</TableHead>
                      <TableHead className="font-bold text-gray-700">Time Window</TableHead>
                      <TableHead className="font-bold text-gray-700">Days Active</TableHead>
                      <TableHead className="font-bold text-gray-700">Status</TableHead>
                      <TableHead className="text-right font-bold text-gray-700">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isSchedulesLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          Loading schedules...
                        </TableCell>
                      </TableRow>
                    ) : schedules.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No menu schedules configured. Click "Add Schedule" to start.
                        </TableCell>
                      </TableRow>
                    ) : (
                      schedules.map((sched) => (
                        <TableRow key={sched.schedule_id}>
                          <TableCell className="font-bold text-gray-800">{sched.name}</TableCell>
                          <TableCell className="font-semibold text-gray-600 text-xs">
                            {sched.start_time.slice(0, 5)} - {sched.end_time.slice(0, 5)}
                          </TableCell>
                          <TableCell className="text-gray-500 text-xs font-medium">
                            {sched.days_of_week.length === 7
                              ? 'All Days'
                              : sched.days_of_week.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}
                          </TableCell>
                          <TableCell>
                            <Badge variant={sched.is_active ? 'default' : 'secondary'} className={sched.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50' : ''}>
                              {sched.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingSchedule(sched);
                                  setScheduleForm({
                                    name: sched.name,
                                    start_time: sched.start_time.slice(0, 5),
                                    end_time: sched.end_time.slice(0, 5),
                                    days_of_week: sched.days_of_week,
                                    is_active: sched.is_active,
                                  });
                                  setScheduleFormOpen(true);
                                }}
                                className="text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl"
                              >
                                <Pencil size={14} className="mr-1" /> Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteSchedule(sched.schedule_id, sched.name)}
                                className="text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl"
                              >
                                <Trash size={14} className="mr-1" /> Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Tab Content 4: Schedule Overrides */}
          {activeTab === 'schedule-overrides' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-700">Active Schedule:</span>
                  <select
                    className="h-9 rounded-lg border border-input bg-white px-3 text-sm font-bold text-emerald-700 focus:ring-2 focus:ring-emerald-500"
                    value={selectedScheduleId}
                    onChange={(e) => setSelectedScheduleId(e.target.value)}
                  >
                    {schedules.map((s) => (
                      <option key={s.schedule_id} value={s.schedule_id}>
                        {s.name} ({s.start_time.slice(0, 5)} - {s.end_time.slice(0, 5)})
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  onClick={handleSaveSchedulePrices}
                  disabled={isItemsSaving || !selectedScheduleId}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-2 shadow-sm font-semibold shrink-0"
                >
                  <Save size={16} /> Save Overrides
                </Button>
              </div>

              <Card className="border bg-white shadow-sm rounded-2xl overflow-hidden">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-gray-50/75">
                      <TableRow>
                        <TableHead className="font-bold text-gray-700">Item Name</TableHead>
                        <TableHead className="font-bold text-gray-700">Category</TableHead>
                        <TableHead className="font-bold text-gray-700">Base Price (Rs)</TableHead>
                        <TableHead className="font-bold text-gray-700 w-36">Schedule Price (Rs)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scheduleItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                            Select a schedule to view items.
                          </TableCell>
                        </TableRow>
                      ) : (
                        scheduleItems.map((item) => (
                          <TableRow key={item.item_id}>
                            <TableCell className="font-bold text-gray-800">{item.item_name}</TableCell>
                            <TableCell className="text-gray-500 text-xs font-semibold">{item.category}</TableCell>
                            <TableCell className="font-semibold text-gray-600">{Number(item.base_price).toFixed(2)}</TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="Use Base"
                                className="h-8 rounded-lg text-xs font-bold text-gray-800"
                                value={editedSchedulePrices[item.item_id] ?? ''}
                                onChange={(e) =>
                                  setEditedSchedulePrices({
                                    ...editedSchedulePrices,
                                    [item.item_id]: e.target.value,
                                  })
                                }
                              />
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Dialog: Zone Form */}
        <Dialog open={zoneFormOpen} onOpenChange={setZoneFormOpen}>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">
                {editingZone ? 'Edit Dining Zone' : 'Create Dining Zone'}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Zones allow you to define custom menu pricing overrides for tables assigned to that area.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleZoneSubmit} className="space-y-4 pt-2">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700">Zone Name</label>
                <Input
                  required
                  placeholder="e.g. AC Hall, Rooftop, Banquet"
                  value={zoneForm.name}
                  onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })}
                  className="rounded-lg h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700">Description</label>
                <Input
                  placeholder="Optional details or pricing policy notes"
                  value={zoneForm.description}
                  onChange={(e) => setZoneForm({ ...zoneForm, description: e.target.value })}
                  className="rounded-lg h-9 text-sm"
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3 bg-gray-50/50">
                <span className="text-xs font-bold text-gray-700">Active Status</span>
                <button
                  type="button"
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                    zoneForm.is_active ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-200 text-gray-500'
                  }`}
                  onClick={() => setZoneForm({ ...zoneForm, is_active: !zoneForm.is_active })}
                >
                  {zoneForm.is_active ? 'Active' : 'Inactive'}
                </button>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setZoneFormOpen(false)} className="rounded-xl text-xs h-9">
                  Cancel
                </Button>
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs h-9">
                  Save Zone
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Dialog: Schedule Form */}
        <Dialog open={scheduleFormOpen} onOpenChange={setScheduleFormOpen}>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">
                {editingSchedule ? 'Edit Menu Schedule' : 'Create Menu Schedule'}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Schedules apply automatic happy hours or breakfast pricing based on server time window.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleScheduleSubmit} className="space-y-4 pt-2">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700">Schedule Name</label>
                <Input
                  required
                  placeholder="e.g. Breakfast Special, Happy Hour"
                  value={scheduleForm.name}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, name: e.target.value })}
                  className="rounded-lg h-9 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700">Start Time</label>
                  <Input
                    required
                    type="time"
                    value={scheduleForm.start_time}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, start_time: e.target.value })}
                    className="rounded-lg h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700">End Time</label>
                  <Input
                    required
                    type="time"
                    value={scheduleForm.end_time}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, end_time: e.target.value })}
                    className="rounded-lg h-9 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 block mb-1">Active Days</label>
                <div className="flex flex-wrap gap-1">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => {
                    const active = scheduleForm.days_of_week.includes(idx);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          const list = active
                            ? scheduleForm.days_of_week.filter((d) => d !== idx)
                            : [...scheduleForm.days_of_week, idx];
                          setScheduleForm({ ...scheduleForm, days_of_week: list });
                        }}
                        className={`w-8 h-8 rounded-full text-xs font-bold transition-all border ${
                          active ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3 bg-gray-50/50">
                <span className="text-xs font-bold text-gray-700">Active Status</span>
                <button
                  type="button"
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                    scheduleForm.is_active ? 'bg-emerald-600 text-white shadow-sm' : 'bg-gray-200 text-gray-500'
                  }`}
                  onClick={() => setScheduleForm({ ...scheduleForm, is_active: !scheduleForm.is_active })}
                >
                  {scheduleForm.is_active ? 'Active' : 'Inactive'}
                </button>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setScheduleFormOpen(false)} className="rounded-xl text-xs h-9">
                  Cancel
                </Button>
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs h-9">
                  Save Schedule
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    </RoleGuard>
  );
}
