'use client';

import React, { useEffect, useMemo, useState } from 'react';
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
import { Plus, Pencil, Power, PowerOff, AlertTriangle, Trash2 } from 'lucide-react';
import apiClient from '@/services/apiClient';
import { formatDate } from '@/lib/utils';

type GstSlab = {
  id: number;
  label: string;
  category: string;
  gst_percentage: string;
  is_active: boolean;
  updated_at: string;
};

type Category = {
  id: number;
  name: string;
  is_active: boolean;
};

type GstForm = {
  label: string;
  category: string;
  gst_percentage: string;
  is_active: boolean;
};

const EMPTY_GST_FORM: GstForm = {
  label: '',
  category: '',
  gst_percentage: '',
  is_active: true,
};

type ExtraCharge = {
  id: number;
  name: string;
  charge_type: 'fixed' | 'percentage';
  value: string;
  is_active: boolean;
  apply_on: 'always' | 'dine_in' | 'parcel' | 'delivery' | 'takeaway' | 'never';
  is_taxable: boolean;
  updated_at: string;
};

type ChargeForm = {
  name: string;
  charge_type: 'fixed' | 'percentage';
  value: string;
  is_active: boolean;
  apply_on: 'always' | 'dine_in' | 'parcel' | 'delivery' | 'takeaway' | 'never';
  is_taxable: boolean;
};

const EMPTY_CHARGE_FORM: ChargeForm = {
  name: '',
  charge_type: 'percentage',
  value: '',
  is_active: true,
  apply_on: 'always',
  is_taxable: false,
};

const APPLY_ON_LABELS: Record<string, string> = {
  always:   'Always (all orders)',
  dine_in:  'Dine In only',
  parcel:   'Parcel / Takeaway',
  delivery: 'Delivery only',
  takeaway: 'Takeaway only',
  never:    'Never (disabled)',
};

const APPLY_ON_COLORS: Record<string, string> = {
  always:   'bg-blue-100 text-blue-700',
  dine_in:  'bg-green-100 text-green-700',
  parcel:   'bg-orange-100 text-orange-700',
  delivery: 'bg-purple-100 text-purple-700',
  takeaway: 'bg-amber-100 text-amber-700',
  never:    'bg-gray-100 text-gray-500',
};

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<'gst' | 'charges'>('gst');

  // GST State
  const [slabs, setSlabs] = useState<GstSlab[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isGstLoading, setIsGstLoading] = useState(true);
  const [isGstSaving, setIsGstSaving] = useState(false);
  const [gstFormOpen, setGstFormOpen] = useState(false);
  const [editingSlab, setEditingSlab] = useState<GstSlab | null>(null);
  const [gstForm, setGstForm] = useState<GstForm>(EMPTY_GST_FORM);
  const [gstErrors, setGstErrors] = useState<Partial<Record<keyof GstForm, string>>>({});
  const [gstConfirmOpen, setGstConfirmOpen] = useState(false);
  const [pendingDeactivateSlab, setPendingDeactivateSlab] = useState<GstSlab | null>(null);

  // Extra Charges State
  const [charges, setCharges] = useState<ExtraCharge[]>([]);
  const [isChargesLoading, setIsChargesLoading] = useState(true);
  const [isChargesSaving, setIsChargesSaving] = useState(false);
  const [chargeFormOpen, setChargeFormOpen] = useState(false);
  const [editingCharge, setEditingCharge] = useState<ExtraCharge | null>(null);
  const [chargeForm, setChargeForm] = useState<ChargeForm>(EMPTY_CHARGE_FORM);
  const [chargeErrors, setChargeErrors] = useState<Partial<Record<keyof ChargeForm, string>>>({});
  const [chargeConfirmOpen, setChargeConfirmOpen] = useState(false);
  const [pendingDeleteCharge, setPendingDeleteCharge] = useState<ExtraCharge | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadGstData() {
    setIsGstLoading(true);
    try {
      const [slabsRes, categoriesRes] = await Promise.all([
        apiClient.get<GstSlab[]>('/gst-config'),
        apiClient.get<Category[]>('/categories'),
      ]);
      setSlabs(slabsRes.data ?? []);
      setCategories(categoriesRes.data ?? []);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Failed to load GST data.');
    } finally {
      setIsGstLoading(false);
    }
  }

  async function loadChargesData() {
    setIsChargesLoading(true);
    try {
      const res = await apiClient.get<ExtraCharge[]>('/extra-charges');
      setCharges(res.data ?? []);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Failed to load charges data.');
    } finally {
      setIsChargesLoading(false);
    }
  }

  useEffect(() => {
    loadGstData();
    loadChargesData();
  }, []);

  const missingGstCategories = useMemo(() => {
    const activeSlabCategories = new Set(
      slabs.filter((s) => s.is_active).map((s) => s.category.toLowerCase())
    );
    return categories
      .filter((c) => c.is_active && !activeSlabCategories.has(c.name.toLowerCase()))
      .map((c) => c.name);
  }, [slabs, categories]);

  // GST Handlers
  function openCreateGstModal() {
    setEditingSlab(null);
    setGstForm(EMPTY_GST_FORM);
    setGstErrors({});
    setGstFormOpen(true);
  }

  function openEditGstModal(slab: GstSlab) {
    setEditingSlab(slab);
    setGstForm({
      label: slab.label,
      category: slab.category,
      gst_percentage: slab.gst_percentage,
      is_active: slab.is_active,
    });
    setGstErrors({});
    setGstFormOpen(true);
  }

  function validateGstForm(): boolean {
    const nextErrors: Partial<Record<keyof GstForm, string>> = {};
    if (!gstForm.label.trim()) nextErrors.label = 'Label is required.';
    if (!gstForm.category) nextErrors.category = 'Category is required.';
    const percentage = Number(gstForm.gst_percentage);
    if (gstForm.gst_percentage === '' || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      nextErrors.gst_percentage = 'GST Percentage must be between 0 and 100.';
    }
    setGstErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleGstSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateGstForm()) return;
    setIsGstSaving(true);
    setErrorMessage(null);
    const payload = {
      ...gstForm,
      gst_percentage: Number(gstForm.gst_percentage),
    };
    try {
      if (editingSlab) {
        await apiClient.put(`/gst-config/${editingSlab.id}`, payload);
      } else {
        await apiClient.post('/gst-config', payload);
      }
      setGstFormOpen(false);
      await loadGstData();
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Failed to save GST slab.');
    } finally {
      setIsGstSaving(false);
    }
  }

  function requestDeactivateGst(slab: GstSlab) {
    setPendingDeactivateSlab(slab);
    setGstConfirmOpen(true);
  }

  async function handleGstDeactivateConfirmed() {
    if (!pendingDeactivateSlab) return;
    try {
      await apiClient.delete(`/gst-config/${pendingDeactivateSlab.id}`);
      setGstConfirmOpen(false);
      setPendingDeactivateSlab(null);
      await loadGstData();
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Failed to deactivate GST slab.');
    }
  }

  async function handleActivateGst(slab: GstSlab) {
    try {
      await apiClient.put(`/gst-config/${slab.id}`, { ...slab, is_active: true });
      await loadGstData();
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Failed to activate GST slab.');
    }
  }

  // Extra Charges Handlers
  function openCreateChargeModal() {
    setEditingCharge(null);
    setChargeForm(EMPTY_CHARGE_FORM);
    setChargeErrors({});
    setChargeFormOpen(true);
  }

  function openEditChargeModal(charge: ExtraCharge) {
    setEditingCharge(charge);
    setChargeForm({
      name: charge.name,
      charge_type: charge.charge_type,
      value: charge.value,
      is_active: charge.is_active,
      apply_on: charge.apply_on ?? 'always',
      is_taxable: charge.is_taxable ?? false,
    });
    setChargeErrors({});
    setChargeFormOpen(true);
  }

  function validateChargeForm(): boolean {
    const nextErrors: Partial<Record<keyof ChargeForm, string>> = {};
    if (!chargeForm.name.trim()) nextErrors.name = 'Charge name is required.';
    const val = Number(chargeForm.value);
    if (chargeForm.value === '' || !Number.isFinite(val) || val <= 0) {
      nextErrors.value = 'Value must be greater than 0.';
    }
    setChargeErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleChargeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateChargeForm()) return;
    setIsChargesSaving(true);
    setErrorMessage(null);
    const payload = {
      ...chargeForm,
      value: Number(chargeForm.value),
    };
    try {
      if (editingCharge) {
        await apiClient.put(`/extra-charges/${editingCharge.id}`, payload);
      } else {
        await apiClient.post('/extra-charges', payload);
      }
      setChargeFormOpen(false);
      await loadChargesData();
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Failed to save charge.');
    } finally {
      setIsChargesSaving(false);
    }
  }

  function requestDeleteCharge(charge: ExtraCharge) {
    setPendingDeleteCharge(charge);
    setChargeConfirmOpen(true);
  }

  async function handleChargeDeleteConfirmed() {
    if (!pendingDeleteCharge) return;
    try {
      await apiClient.delete(`/extra-charges/${pendingDeleteCharge.id}`);
      setChargeConfirmOpen(false);
      setPendingDeleteCharge(null);
      await loadChargesData();
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Failed to delete charge.');
    }
  }

  async function handleToggleChargeStatus(charge: ExtraCharge) {
    try {
      await apiClient.put(`/extra-charges/${charge.id}`, { ...charge, is_active: !charge.is_active });
      await loadChargesData();
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Failed to update charge status.');
    }
  }

  return (
    <RoleGuard allowedRoles={['superadmin', 'admin']}>
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Taxes & Settings</h1>
              <p className="text-sm text-muted-foreground">Manage GST rates, Service Charges, and Custom Packaging/Delivery fees.</p>
            </div>
            <div>
              {activeTab === 'gst' ? (
                <Button onClick={openCreateGstModal} className="gap-2 rounded-xl">
                  <Plus size={16} /> Add GST Slab
                </Button>
              ) : (
                <Button onClick={openCreateChargeModal} className="gap-2 rounded-xl bg-purple-600 hover:bg-purple-700">
                  <Plus size={16} /> Add Extra Charge
                </Button>
              )}
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-6">
              <button
                onClick={() => { setActiveTab('gst'); setErrorMessage(null); }}
                className={`whitespace-nowrap py-3 px-1 border-b-2 font-semibold text-sm transition-all ${
                  activeTab === 'gst'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                GST Configurations
              </button>
              <button
                onClick={() => { setActiveTab('charges'); setErrorMessage(null); }}
                className={`whitespace-nowrap py-3 px-1 border-b-2 font-semibold text-sm transition-all ${
                  activeTab === 'charges'
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Extra Taxes & Charges
              </button>
            </nav>
          </div>

          {errorMessage && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </div>
          )}

          {activeTab === 'gst' ? (
            <div className="space-y-6">
              {missingGstCategories.length > 0 && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-600" />
                    <div>
                      <h3 className="text-sm font-medium text-yellow-800">Missing GST Configuration</h3>
                      <p className="mt-1 text-sm text-yellow-700">
                        The following categories do not have an active GST slab: {missingGstCategories.join(', ')}. 
                        Bills with items from these categories may have incorrect GST calculations.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <Card className="border bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">GST Slabs</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Label</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>GST %</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Updated</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isGstLoading ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                            Loading GST configuration...
                          </TableCell>
                        </TableRow>
                      ) : slabs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                            No GST slabs found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        slabs.map((slab) => (
                          <TableRow key={slab.id}>
                            <TableCell className="font-medium">{slab.label}</TableCell>
                            <TableCell>{slab.category}</TableCell>
                            <TableCell>{Number(slab.gst_percentage).toFixed(2)}%</TableCell>
                            <TableCell>
                              <Badge variant={slab.is_active ? 'default' : 'secondary'}>
                                {slab.is_active ? 'Active' : 'Inactive'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {formatDate(slab.updated_at)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="gap-1 h-8"
                                  onClick={() => openEditGstModal(slab)}
                                >
                                  <Pencil size={13} />
                                  Edit
                                </Button>
                                {slab.is_active ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1 h-8 text-destructive hover:text-destructive"
                                    onClick={() => requestDeactivateGst(slab)}
                                  >
                                    <PowerOff size={13} />
                                    Deactivate
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1 h-8 text-primary hover:text-primary"
                                    onClick={() => handleActivateGst(slab)}
                                  >
                                    <Power size={13} />
                                    Activate
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="border bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Extra Taxes & Charges</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Charge Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Apply On</TableHead>
                      <TableHead>Tax Treatment</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isChargesLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                          Loading charges...
                        </TableCell>
                      </TableRow>
                    ) : charges.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                          No custom extra charges configured yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      charges.map((charge) => (
                        <TableRow key={charge.id}>
                          <TableCell className="font-semibold">{charge.name}</TableCell>
                          <TableCell className="capitalize">{charge.charge_type}</TableCell>
                          <TableCell>
                            {charge.charge_type === 'percentage'
                              ? `${Number(charge.value).toFixed(2)}%`
                              : `Rs ${Number(charge.value).toFixed(2)}`}
                          </TableCell>
                          <TableCell>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${APPLY_ON_COLORS[charge.apply_on] ?? 'bg-gray-100 text-gray-500'}`}>
                              {APPLY_ON_LABELS[charge.apply_on] ?? charge.apply_on}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              charge.is_taxable ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {charge.is_taxable ? 'Taxable' : 'Non-taxable'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={charge.is_active ? 'default' : 'secondary'}>
                              {charge.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDate(charge.updated_at)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1 h-8 border-purple-200 text-purple-600 hover:bg-purple-50"
                                onClick={() => openEditChargeModal(charge)}
                              >
                                <Pencil size={13} />
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className={`gap-1 h-8 ${
                                  charge.is_active 
                                    ? 'text-amber-600 border-amber-200 hover:bg-amber-50'
                                    : 'text-green-600 border-green-200 hover:bg-green-50'
                                }`}
                                onClick={() => handleToggleChargeStatus(charge)}
                              >
                                {charge.is_active ? <PowerOff size={13} /> : <Power size={13} />}
                                {charge.is_active ? 'Disable' : 'Enable'}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1 h-8 text-destructive border-red-200 hover:bg-red-50"
                                onClick={() => requestDeleteCharge(charge)}
                              >
                                <Trash2 size={13} />
                                Delete
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
        </div>

        {/* GST Form Dialog */}
        <Dialog open={gstFormOpen} onOpenChange={setGstFormOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingSlab ? 'Edit GST Slab' : 'Add GST Slab'}</DialogTitle>
              <DialogDescription>
                Configure GST percentage for a specific category.
              </DialogDescription>
            </DialogHeader>

            <form className="space-y-4" onSubmit={handleGstSubmit}>
              <div className="space-y-2">
                <label className="text-sm font-medium">Label</label>
                <Input
                  value={gstForm.label}
                  onChange={(e) => setGstForm({ ...gstForm, label: e.target.value })}
                  placeholder="e.g. Food & Beverages"
                />
                {gstErrors.label && <p className="text-xs text-destructive">{gstErrors.label}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Category</label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={gstForm.category}
                  onChange={(e) => setGstForm({ ...gstForm, category: e.target.value })}
                >
                  <option value="">Select category</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                {gstErrors.category && <p className="text-xs text-destructive">{gstErrors.category}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">GST Percentage (%)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={gstForm.gst_percentage}
                  onChange={(e) => setGstForm({ ...gstForm, gst_percentage: e.target.value })}
                  placeholder="0.00"
                />
                {gstErrors.gst_percentage && <p className="text-xs text-destructive">{gstErrors.gst_percentage}</p>}
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <span className="text-sm font-medium">Active</span>
                <button
                  type="button"
                  className={`rounded-md px-3 py-1 text-xs font-medium ${
                    gstForm.is_active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                  onClick={() => setGstForm({ ...gstForm, is_active: !gstForm.is_active })}
                >
                  {gstForm.is_active ? 'Yes' : 'No'}
                </button>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setGstFormOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isGstSaving}>
                  {isGstSaving ? 'Saving...' : editingSlab ? 'Update Slab' : 'Create Slab'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* GST Confirm Dialog */}
        <Dialog open={gstConfirmOpen} onOpenChange={setGstConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Deactivate GST Slab</DialogTitle>
              <DialogDescription>
                Are you sure you want to deactivate this GST slab? This will affect new bills immediately.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setGstConfirmOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleGstDeactivateConfirmed}>Confirm Deactivate</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Extra Charge Form Dialog */}
        <Dialog open={chargeFormOpen} onOpenChange={setChargeFormOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingCharge ? 'Edit Extra Charge' : 'Add Extra Charge'}</DialogTitle>
              <DialogDescription>
                Create custom charge rates like packaging fees, service taxes, or delivery charges.
              </DialogDescription>
            </DialogHeader>

            <form className="space-y-4" onSubmit={handleChargeSubmit}>
              <div className="space-y-2">
                <label className="text-sm font-medium">Charge Name</label>
                <Input
                  value={chargeForm.name}
                  onChange={(e) => setChargeForm({ ...chargeForm, name: e.target.value })}
                  placeholder="e.g. Service Charge / Packaging Fee"
                />
                {chargeErrors.name && <p className="text-xs text-destructive">{chargeErrors.name}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Charge Type</label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={chargeForm.charge_type}
                    onChange={(e) => setChargeForm({ ...chargeForm, charge_type: e.target.value as 'fixed' | 'percentage' })}
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed (Rs)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Value</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={chargeForm.value}
                    onChange={(e) => setChargeForm({ ...chargeForm, value: e.target.value })}
                    placeholder="e.g. 5.00"
                  />
                  {chargeErrors.value && <p className="text-xs text-destructive">{chargeErrors.value}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Apply On</label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={chargeForm.apply_on}
                  onChange={(e) => setChargeForm({ ...chargeForm, apply_on: e.target.value as ChargeForm['apply_on'] })}
                >
                  <option value="always">Always — all order types</option>
                  <option value="dine_in">Dine In only</option>
                  <option value="parcel">Parcel / Takeaway</option>
                  <option value="delivery">Delivery only</option>
                  <option value="never">Never (soft disable)</option>
                </select>
                <p className="text-xs text-muted-foreground">Controls when this charge is automatically applied to a bill.</p>
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <span className="text-sm font-medium">Include in GST Base</span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    If enabled, this charge is added to the item subtotal <strong>before</strong> GST is calculated (e.g. packaging fee).
                  </p>
                </div>
                <button
                  type="button"
                  className={`rounded-md px-3 py-1 text-xs font-medium ml-3 shrink-0 ${
                    chargeForm.is_taxable ? 'bg-indigo-600 text-white' : 'bg-muted text-muted-foreground'
                  }`}
                  onClick={() => setChargeForm({ ...chargeForm, is_taxable: !chargeForm.is_taxable })}
                >
                  {chargeForm.is_taxable ? 'Yes — Taxable' : 'No — Non-taxable'}
                </button>
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <span className="text-sm font-medium">Active</span>
                <button
                  type="button"
                  className={`rounded-md px-3 py-1 text-xs font-medium ${
                    chargeForm.is_active ? 'bg-purple-600 text-white' : 'bg-muted text-muted-foreground'
                  }`}
                  onClick={() => setChargeForm({ ...chargeForm, is_active: !chargeForm.is_active })}
                >
                  {chargeForm.is_active ? 'Yes' : 'No'}
                </button>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setChargeFormOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isChargesSaving} className="bg-purple-600 hover:bg-purple-700 text-white">
                  {isChargesSaving ? 'Saving...' : editingCharge ? 'Update Charge' : 'Create Charge'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Charge Confirm Delete Dialog */}
        <Dialog open={chargeConfirmOpen} onOpenChange={setChargeConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Extra Charge</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this custom charge? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setChargeConfirmOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleChargeDeleteConfirmed}>Delete Charge</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    </RoleGuard>
  );
}
