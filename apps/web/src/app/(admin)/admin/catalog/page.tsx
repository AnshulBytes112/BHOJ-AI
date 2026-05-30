'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Plus, Pencil, Power, PowerOff, Upload, X, ImageIcon, Trash2 } from 'lucide-react';
import apiClient from '@/services/apiClient';

type StockType = 'limited' | 'unlimited';
type StatusFilter = 'all' | 'active' | 'inactive';

type Item = {
  id: number;
  serial_number: string;
  name: string;
  selling_price: string;
  category: string;
  stock_quantity: number;
  is_active: boolean;
  stock_type: StockType;
  image_url: string | null;
  created_at: string;
  updated_at: string;
};

type Category = {
  id: number;
  name: string;
  is_active: boolean;
};

type ItemForm = {
  name: string;
  selling_price: string;
  category: string;
  stock_quantity: string;
  stock_type: StockType;
  is_active: boolean;
  image_url: string | null;
};

const EMPTY_FORM: ItemForm = {
  name: '',
  selling_price: '',
  category: '',
  stock_quantity: '0',
  stock_type: 'limited',
  is_active: true,
  image_url: null,
};

const MAX_IMAGE_SIZE_KB = 500;
const MAX_IMAGE_DIMENSION = 800;

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
          if (width > height) {
            height = Math.round((height / width) * MAX_IMAGE_DIMENSION);
            width = MAX_IMAGE_DIMENSION;
          } else {
            width = Math.round((width / height) * MAX_IMAGE_DIMENSION);
            height = MAX_IMAGE_DIMENSION;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.8;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);

        while (dataUrl.length > MAX_IMAGE_SIZE_KB * 1024 && quality > 0.1) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export default function AdminCatalogPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCategorySaving, setIsCategorySaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [newCategoryName, setNewCategoryName] = useState('');
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [form, setForm] = useState<ItemForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof ItemForm, string>>>({});
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeactivateItem, setPendingDeactivateItem] = useState<Item | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<Item | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const categoryNames = useMemo(
    () => categories.map((c) => c.name).sort((a, b) => a.localeCompare(b)),
    [categories]
  );

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const categoryMatch = selectedCategory === 'all' || item.category === selectedCategory;
      const statusMatch =
        statusFilter === 'all' ||
        (statusFilter === 'active' && item.is_active) ||
        (statusFilter === 'inactive' && !item.is_active);

      return categoryMatch && statusMatch;
    });
  }, [items, selectedCategory, statusFilter]);

  async function loadItems() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const params: Record<string, string> = {};

      if (selectedCategory !== 'all') {
        params.category = selectedCategory;
      }
      if (statusFilter === 'active') {
        params.is_active = 'true';
      }
      if (statusFilter === 'inactive') {
        params.is_active = 'false';
      }

      const response = await apiClient.get<Item[]>('/items', { params });
      setItems(response.data ?? []);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Failed to load items.');
    } finally {
      setIsLoading(false);
    }
  }

  async function loadCategories() {
    try {
      const response = await apiClient.get<Category[]>('/categories');
      setCategories(response.data ?? []);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Failed to load categories.');
    }
  }

  useEffect(() => {
    loadItems();
  }, [selectedCategory, statusFilter]);

  useEffect(() => {
    loadCategories();
  }, []);

  const handleImageFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Image must be smaller than 5MB.');
      return;
    }
    setIsUploadingImage(true);
    try {
      const base64 = await compressImage(file);
      setForm((prev) => ({ ...prev, image_url: base64 }));
      setImagePreview(base64);
    } catch {
      setErrorMessage('Failed to process image.');
    } finally {
      setIsUploadingImage(false);
    }
  }, []);

  function removeImage() {
    setForm((prev) => ({ ...prev, image_url: null }));
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function openCreateModal() {
    setEditingItem(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setImagePreview(null);
    setIsFormOpen(true);
  }

  function openEditModal(item: Item) {
    setEditingItem(item);
    setForm({
      name: item.name,
      selling_price: Number(item.selling_price).toFixed(2),
      category: item.category,
      stock_quantity: String(item.stock_quantity ?? 0),
      stock_type: item.stock_type,
      is_active: item.is_active,
      image_url: item.image_url,
    });
    setFormErrors({});
    setImagePreview(item.image_url);
    setIsFormOpen(true);
  }

  function validateForm(): boolean {
    const nextErrors: Partial<Record<keyof ItemForm, string>> = {};

    if (!form.name.trim()) {
      nextErrors.name = 'Item name is required.';
    }

    const price = Number(form.selling_price);
    if (!form.selling_price || !Number.isFinite(price) || price <= 0) {
      nextErrors.selling_price = 'Selling price must be greater than 0.';
    }

    if (!form.category.trim()) {
      nextErrors.category = 'Category is required.';
    }

    const qty = Number(form.stock_quantity);
    if (!Number.isInteger(qty) || qty < 0) {
      nextErrors.stock_quantity = 'Stock quantity must be an integer >= 0.';
    }

    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const payload = {
      name: form.name.trim(),
      selling_price: Number(form.selling_price),
      category: form.category.trim(),
      stock_quantity: Number(form.stock_quantity),
      stock_type: form.stock_type,
      image_url: form.image_url,
      ...(editingItem ? { is_active: form.is_active } : {}),
    };

    try {
      if (editingItem) {
        await apiClient.put(`/items/${editingItem.id}`, payload);
      } else {
        await apiClient.post('/items', payload);
      }

      setIsFormOpen(false);
      await loadItems();
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Failed to save item.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleActivate(item: Item) {
    try {
      await apiClient.put(`/items/${item.id}`, { is_active: true });
      loadItems();
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Failed to activate item.');
    }
  }

  function requestDelete(item: Item) {
    setPendingDeleteItem(item);
    setIsDeleteOpen(true);
  }

  async function handleDeleteConfirmed() {
    if (!pendingDeleteItem) return;
    setIsDeleting(true);
    setErrorMessage(null);
    try {
      await apiClient.delete(`/items/${pendingDeleteItem.id}`);
      setPendingDeleteItem(null);
      loadItems();
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Failed to delete item. It might be used in existing bills.');
    } finally {
      setIsDeleting(false);
      setIsDeleteOpen(false); // Close dialog in all cases
    }
  }

  async function handleCreateCategory() {
    if (!newCategoryName.trim()) {
      setErrorMessage('Category name is required.');
      return;
    }

    setIsCategorySaving(true);
    try {
      await apiClient.post('/categories', { name: newCategoryName.trim() });
      setNewCategoryName('');
      setIsCategoryDialogOpen(false);
      await loadCategories();
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Failed to create category.');
    } finally {
      setIsCategorySaving(false);
    }
  }

  function requestDeactivate(item: Item) {
    setPendingDeactivateItem(item);
    setConfirmOpen(true);
  }

  async function handleDeactivateConfirmed() {
    if (!pendingDeactivateItem) {
      return;
    }

    try {
      await apiClient.put(`/items/${pendingDeactivateItem.id}`, { is_active: false });
      setConfirmOpen(false);
      setPendingDeactivateItem(null);
      await loadItems();
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Failed to deactivate item.');
    }
  }

  return (
    <RoleGuard allowedRoles={['superadmin', 'admin']}>
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Item Catalog</h1>
              <p className="text-sm text-muted-foreground">Manage POS items, pricing, categories, and availability.</p>
            </div>
            <Button onClick={openCreateModal} className="gap-2 rounded-xl">
              <Plus size={16} />
              Add Item
            </Button>
            <Button variant="outline" onClick={() => setIsCategoryDialogOpen(true)} className="gap-2 rounded-xl ml-2">
              <Plus size={16} />
              Add Category
            </Button>
          </div>

          {errorMessage && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-xl flex items-center justify-between">
              <p className="text-sm font-medium">{errorMessage}</p>
              <button onClick={() => setErrorMessage(null)}>
                <X size={16} />
              </button>
            </div>
          )}

          <Card className="border bg-white shadow-sm">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Category</label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                  >
                    <option value="all">All Categories</option>
                    {categoryNames.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Status</label>
                  <div className="inline-flex rounded-lg border border-input bg-muted/30 p-1">
                    <button
                      type="button"
                      className={`rounded-md px-3 py-1 text-xs font-medium ${
                        statusFilter === 'active' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                      }`}
                      onClick={() => setStatusFilter('active')}
                    >
                      Active
                    </button>
                    <button
                      type="button"
                      className={`rounded-md px-3 py-1 text-xs font-medium ${
                        statusFilter === 'inactive' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                      }`}
                      onClick={() => setStatusFilter('inactive')}
                    >
                      Inactive
                    </button>
                    <button
                      type="button"
                      className={`rounded-md px-3 py-1 text-xs font-medium ${
                        statusFilter === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                      }`}
                      onClick={() => setStatusFilter('all')}
                    >
                      All
                    </button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Items</CardTitle>
            </CardHeader>
            <CardContent>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Image</TableHead>
                    <TableHead>Serial No</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Stock Qty</TableHead>
                    <TableHead>Stock Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-20 text-center text-muted-foreground">
                        Loading catalog...
                      </TableCell>
                    </TableRow>
                  ) : filteredItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-20 text-center text-muted-foreground">
                        No items found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt={item.name}
                              className="h-10 w-10 rounded-md object-cover border"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
                              <ImageIcon size={16} className="text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{item.serial_number}</TableCell>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>{item.category}</TableCell>
                        <TableCell className="text-right">Rs {Number(item.selling_price).toFixed(2)}</TableCell>
                        <TableCell className="text-right">{item.stock_quantity}</TableCell>
                        <TableCell className="capitalize">{item.stock_type}</TableCell>
                        <TableCell>
                          <Badge variant={item.is_active ? 'default' : 'secondary'}>
                            {item.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-1"
                              onClick={() => openEditModal(item)}
                            >
                              <Pencil size={14} />
                              Edit
                            </Button>

                            {item.is_active ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                onClick={() => requestDeactivate(item)}
                              >
                                <PowerOff size={14} />
                                Deactivate
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                onClick={() => handleActivate(item)}
                              >
                                <Power size={14} />
                                Activate
                              </Button>
                            )}

                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-1 text-destructive hover:bg-destructive/10 border-destructive/20"
                              onClick={() => requestDelete(item)}
                            >
                              <Trash2 size={14} />
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
        </div>

        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingItem ? 'Edit Item' : 'Add Item'}</DialogTitle>
              <DialogDescription>
                {editingItem
                  ? 'Update item details and status.'
                  : 'Create a new catalog item. Serial number and id are generated by the system.'}
              </DialogDescription>
            </DialogHeader>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Item Name</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Paneer Tikka"
                />
                {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Selling Price</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.selling_price}
                  onChange={(e) => setForm((prev) => ({ ...prev, selling_price: e.target.value }))}
                  placeholder="0.00"
                />
                {formErrors.selling_price && <p className="text-xs text-destructive">{formErrors.selling_price}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Category</label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.category}
                  onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                >
                  <option value="">Select category</option>
                  {categoryNames.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
                {formErrors.category && <p className="text-xs text-destructive">{formErrors.category}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Stock Quantity</label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={form.stock_quantity}
                  onChange={(e) => setForm((prev) => ({ ...prev, stock_quantity: e.target.value }))}
                  placeholder="0"
                />
                {formErrors.stock_quantity && <p className="text-xs text-destructive">{formErrors.stock_quantity}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Stock Type</label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.stock_type}
                  onChange={(e) => setForm((prev) => ({ ...prev, stock_type: e.target.value as StockType }))}
                >
                  <option value="limited">Limited</option>
                  <option value="unlimited">Unlimited</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Item Image</label>
                <div
                  className={`relative rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
                    isDragging
                      ? 'border-primary bg-primary/5'
                      : 'border-input hover:border-primary/50'
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files[0];
                    if (file) handleImageFile(file);
                  }}
                >
                  {imagePreview ? (
                    <div className="relative inline-block">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="mx-auto h-32 w-32 rounded-lg object-cover border"
                      />
                      <button
                        type="button"
                        onClick={removeImage}
                        className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-white shadow-md hover:bg-destructive/90 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div
                      className="cursor-pointer py-4"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {isUploadingImage ? (
                        <div className="flex flex-col items-center gap-2">
                          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                          <p className="text-sm text-muted-foreground">Processing image...</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <Upload size={24} className="text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">
                            Click to upload or drag & drop
                          </p>
                          <p className="text-xs text-muted-foreground/70">
                            PNG, JPG, WEBP up to 5MB
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageFile(file);
                    }}
                  />
                </div>
              </div>

              {editingItem && (
                <div className="flex items-center justify-between rounded-md border border-input px-3 py-2">
                  <span className="text-sm font-medium text-foreground">Status</span>
                  <button
                    type="button"
                    className={`rounded-md px-3 py-1 text-xs font-medium ${
                      form.is_active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}
                    onClick={() => setForm((prev) => ({ ...prev, is_active: !prev.is_active }))}
                  >
                    {form.is_active ? 'Active' : 'Inactive'}
                  </button>
                </div>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? 'Saving...' : editingItem ? 'Update Item' : 'Create Item'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Deactivate Item</DialogTitle>
              <DialogDescription>
                {pendingDeactivateItem
                  ? `Are you sure you want to deactivate ${pendingDeactivateItem.name}?`
                  : 'Are you sure you want to deactivate this item?'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={handleDeactivateConfirmed}>
                Confirm Deactivate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-destructive">Delete Item Permanently</DialogTitle>
              <DialogDescription>
                {pendingDeleteItem
                  ? `Are you sure you want to delete "${pendingDeleteItem.name}"? This action cannot be undone.`
                  : 'Are you sure you want to delete this item? This action cannot be undone.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDeleteOpen(false)}>
                Cancel
              </Button>
              <Button 
                type="button" 
                variant="destructive" 
                onClick={handleDeleteConfirmed}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Category</DialogTitle>
              <DialogDescription>Add a new category for item assignment.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Category Name</label>
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Ex: Beverages"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={isCategorySaving} onClick={handleCreateCategory}>
                {isCategorySaving ? 'Creating...' : 'Create Category'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    </RoleGuard>
  );
}
