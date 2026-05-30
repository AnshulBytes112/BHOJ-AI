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
import { Plus, Pencil, Power, PowerOff, AlertTriangle } from 'lucide-react';
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

const EMPTY_FORM: GstForm = {
  label: '',
  category: '',
  gst_percentage: '',
  is_active: true,
};

export default function AdminGstPage() {
  const [slabs, setSlabs] = useState<GstSlab[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSlab, setEditingSlab] = useState<GstSlab | null>(null);
  const [form, setForm] = useState<GstForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof GstForm, string>>>({});

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeactivateSlab, setPendingDeactivateSlab] = useState<GstSlab | null>(null);

  async function loadData() {
    setIsLoading(true);
    setErrorMessage(null);

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
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const missingGstCategories = useMemo(() => {
    const activeSlabCategories = new Set(
      slabs.filter((s) => s.is_active).map((s) => s.category.toLowerCase())
    );
    return categories
      .filter((c) => c.is_active && !activeSlabCategories.has(c.name.toLowerCase()))
      .map((c) => c.name);
  }, [slabs, categories]);

  function openCreateModal() {
    setEditingSlab(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setIsFormOpen(true);
  }

  function openEditModal(slab: GstSlab) {
    setEditingSlab(slab);
    setForm({
      label: slab.label,
      category: slab.category,
      gst_percentage: slab.gst_percentage,
      is_active: slab.is_active,
    });
    setFormErrors({});
    setIsFormOpen(true);
  }

  function validateForm(): boolean {
    const nextErrors: Partial<Record<keyof GstForm, string>> = {};

    if (!form.label.trim()) {
      nextErrors.label = 'Label is required.';
    }

    if (!form.category) {
      nextErrors.category = 'Category is required.';
    }

    const percentage = Number(form.gst_percentage);
    if (form.gst_percentage === '' || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      nextErrors.gst_percentage = 'GST Percentage must be between 0 and 100.';
    }

    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSaving(true);
    setErrorMessage(null);

    const payload = {
      ...form,
      gst_percentage: Number(form.gst_percentage),
    };

    try {
      if (editingSlab) {
        await apiClient.put(`/gst-config/${editingSlab.id}`, payload);
      } else {
        await apiClient.post('/gst-config', payload);
      }

      setIsFormOpen(false);
      await loadData();
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Failed to save GST slab.');
    } finally {
      setIsSaving(false);
    }
  }

  function requestDeactivate(slab: GstSlab) {
    setPendingDeactivateSlab(slab);
    setConfirmOpen(true);
  }

  async function handleDeactivateConfirmed() {
    if (!pendingDeactivateSlab) return;

    try {
      await apiClient.delete(`/gst-config/${pendingDeactivateSlab.id}`);
      setConfirmOpen(false);
      setPendingDeactivateSlab(null);
      await loadData();
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Failed to deactivate GST slab.');
    }
  }

  async function handleActivate(slab: GstSlab) {
    try {
      await apiClient.put(`/gst-config/${slab.id}`, { ...slab, is_active: true });
      await loadData();
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Failed to activate GST slab.');
    }
  }

  return (
    <RoleGuard allowedRoles={['superadmin', 'admin']}>
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">GST Configuration</h1>
              <p className="text-sm text-muted-foreground">Manage GST slabs for different item categories.</p>
            </div>
            <Button onClick={openCreateModal} className="gap-2 rounded-xl">
              <Plus size={16} />
              Add GST Slab
            </Button>
          </div>

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
              {errorMessage && (
                <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {errorMessage}
                </div>
              )}

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
                  {isLoading ? (
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
                              className="gap-1"
                              onClick={() => openEditModal(slab)}
                            >
                              <Pencil size={14} />
                              Edit
                            </Button>
                            {slab.is_active ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1 text-destructive hover:text-destructive"
                                onClick={() => requestDeactivate(slab)}
                              >
                                <PowerOff size={14} />
                                Deactivate
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1 text-primary hover:text-primary"
                                onClick={() => handleActivate(slab)}
                              >
                                <Power size={14} />
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

        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingSlab ? 'Edit GST Slab' : 'Add GST Slab'}</DialogTitle>
              <DialogDescription>
                Configure GST percentage for a specific category.
              </DialogDescription>
            </DialogHeader>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-sm font-medium">Label</label>
                <Input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="e.g. Food & Beverages"
                />
                {formErrors.label && <p className="text-xs text-destructive">{formErrors.label}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Category</label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  <option value="">Select category</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                {formErrors.category && <p className="text-xs text-destructive">{formErrors.category}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">GST Percentage (%)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={form.gst_percentage}
                  onChange={(e) => setForm({ ...form, gst_percentage: e.target.value })}
                  placeholder="0.00"
                />
                {formErrors.gst_percentage && <p className="text-xs text-destructive">{formErrors.gst_percentage}</p>}
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <span className="text-sm font-medium">Active</span>
                <button
                  type="button"
                  className={`rounded-md px-3 py-1 text-xs font-medium ${
                    form.is_active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                  onClick={() => setForm({ ...form, is_active: !form.is_active })}
                >
                  {form.is_active ? 'Yes' : 'No'}
                </button>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? 'Saving...' : editingSlab ? 'Update Slab' : 'Create Slab'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Deactivate GST Slab</DialogTitle>
              <DialogDescription>
                Are you sure you want to deactivate this GST slab? This will affect new bills immediately.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeactivateConfirmed}>Confirm Deactivate</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    </RoleGuard>
  );
}
