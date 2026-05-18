'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { RoleGuard } from '@/components/auth/role-guard';
import { cn, formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Search, 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  Printer, 
  Share2, 
  CheckCircle2,
  Percent,
  Pencil,
  Power,
  PowerOff,
  Upload,
  X,
  ImageIcon,
  UtensilsCrossed
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import apiClient from '@/services/apiClient';
import { ReceiptData, ReceiptPrint } from '@/components/admin/receipt-print';

type MenuCategory = {
  id: string;
  name: string;
  defaultGst: number;
};

type MenuItem = {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  description: string;
  image?: string;
  isVegetarian: boolean;
  isAvailable: boolean;
  gstRate?: number;
  stockType: 'limited' | 'unlimited';
  stockQuantity: number;
};

type CartItem = MenuItem & { quantity: number };

type StockType = 'limited' | 'unlimited';
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

export default function POSTerminal() {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isOrderPlaced, setIsOrderPlaced] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [discountType, setDiscountType] = useState('Percentage (%)');
  const [discountValue, setDiscountValue] = useState(0);
  const [gstMode, setGstMode] = useState('Inclusive');
  const [gstRates, setGstRates] = useState<{ [key: string]: number }>({});
  const [gstin, setGstin] = useState('29ABCDE1234F1Z5');
  const [orderType, setOrderType] = useState('Dine In');
  // selectedTable now stores the real UUID table_id from the DB
  const [selectedTable, setSelectedTable] = useState('');
  const [selectedTableLabel, setSelectedTableLabel] = useState('Select Table');
  const [dbTables, setDbTables] = useState<{ table_id: string; table_number: string; status: string }[]>([]);
  const [existingOrders, setExistingOrders] = useState<any[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [selectedWaiter, setSelectedWaiter] = useState('John Paul');
  const [guests, setGuests] = useState(4);
  const [activeWorkflow, setActiveWorkflow] = useState('categories');
  const [isAddTableDialogOpen, setIsAddTableDialogOpen] = useState(false);
  const [newTableNumber, setNewTableNumber] = useState('');
  const [newTableCapacity, setNewTableCapacity] = useState('4');
  const [isAddingTable, setIsAddingTable] = useState(false);
  const [receiptLayout, setReceiptLayout] = useState<any>(null);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [isGeneratingBill, setIsGeneratingBill] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [showWipDialog, setShowWipDialog] = useState(false);
  const [autoRedirectTimer, setAutoRedirectTimer] = useState<number | null>(null);

  // Catalog CRUD states
  const [isSaving, setIsSaving] = useState(false);
  const [isCategorySaving, setIsCategorySaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [form, setForm] = useState<ItemForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof ItemForm, string>>>({});
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const printRef = useRef<HTMLDivElement>(null);

  const workflowTabs = [
    { id: 'categories', label: 'POS - Categories & Items' },
    { id: 'summary', label: 'POS - Billing Summary' },
    { id: 'gst', label: 'POS - Discount & GST View' },
    { id: 'payment', label: 'POS - Payment' },
    { id: 'receipt', label: 'POS - Bill Receipt' },
  ];

  const handleNewBill = () => {
    setCart([]);
    setIsOrderPlaced(false);
    setOrderId('');
    setActiveWorkflow('categories');
  };

  const loadData = async () => {
    try {
      const [catsResp, itemsResp, tablesResp] = await Promise.all([
        apiClient.get<Array<{ id: number; name: string }>>('/categories'),
        apiClient.get<Array<{
          id: number; category: string; name: string; selling_price: string;
          stock_type: 'limited' | 'unlimited'; stock_quantity: number; is_active: boolean; image_url: string | null;
        }>>('/items'),
        apiClient.get<Array<{ table_id: string; table_number: string; status: string }>>('/tables'),
      ]);

      // Auto-seed tables 1-10 if DB has none
      if ((tablesResp.data ?? []).length === 0) {
        await Promise.allSettled(
          Array.from({ length: 10 }, (_, i) =>
            apiClient.post('/tables', { table_number: String(i + 1) })
          )
        );
        const reloaded = await apiClient.get<Array<{ table_id: string; table_number: string; status: string }>>('/tables');
        tablesResp.data = reloaded.data;
      }

      const cats: MenuCategory[] = (catsResp.data ?? []).map((c) => ({
        id: String(c.id), name: c.name, defaultGst: 0,
      }));
      const categoryIdByName = new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));

      const allItems: MenuItem[] = (itemsResp.data ?? []).map((item) => ({
        id: String(item.id),
        categoryId: categoryIdByName.get(item.category.toLowerCase()) ?? 'unknown',
        name: item.name, price: Number(item.selling_price), description: '',
        isVegetarian: true, isAvailable: item.is_active, gstRate: 0,
        stockType: item.stock_type, stockQuantity: item.stock_quantity ?? 0,
        image: item.image_url ? (item.image_url.startsWith('http') || item.image_url.startsWith('data:')
          ? item.image_url : `${apiClient.defaults.baseURL?.replace('/api', '')}/${item.image_url}`) : undefined,
      }));

      const tables = tablesResp.data ?? [];
      setDbTables(tables);
      // Auto-select first free table
      const firstFree = tables.find(t => t.status === 'free');
      if (firstFree) {
        setSelectedTable(firstFree.table_id);
        setSelectedTableLabel(`Table ${firstFree.table_number}`);
      }

      setCategories(cats);
      setItems(allItems);
      setFilteredItems(allItems);

      try {
        const gstConfigResp = await apiClient.get<Array<{ category: string; gst_percentage: string; is_active: boolean }>>('/gst-config');
        const nextGstMap: { [key: string]: number } = {};
        (gstConfigResp.data ?? []).forEach(row => {
          if (row.is_active) {
            const catId = categoryIdByName.get(row.category.toLowerCase());
            if (catId) nextGstMap[catId] = Number(row.gst_percentage);
          }
        });
        setGstRates(nextGstMap);
      } catch (e) { console.error('Failed to load GST config', e); }

      try {
        const layoutResp = await apiClient.get('/receipt-layout');
        setReceiptLayout(layoutResp.data);
      } catch (e) { console.error('Failed to load receipt layout', e); }

      setIsLoading(false);
    } catch (error) {
      console.error('Error loading POS data:', error);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const fetchTableOrders = useCallback(async (tableId: string) => {
    const table = dbTables.find(t => t.table_id === tableId);
    if (!table || table.status !== 'occupied') {
      setExistingOrders([]);
      return;
    }

    setIsLoadingOrders(true);
    try {
      const response = await apiClient.get(`/tables/${tableId}/orders`);
      setExistingOrders(response.data || []);
    } catch (error) {
      console.error('Failed to fetch table orders:', error);
      setExistingOrders([]);
    } finally {
      setIsLoadingOrders(false);
    }
  }, [dbTables]);

  useEffect(() => {
    if (selectedTable) {
      fetchTableOrders(selectedTable);
    }
  }, [selectedTable, fetchTableOrders]);

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

  function openEditModal(item: MenuItem) {
    const categoryName = categories.find(c => c.id === item.categoryId)?.name || '';
    setEditingItem(item);
    setForm({
      name: item.name,
      selling_price: item.price.toFixed(2),
      category: categoryName,
      stock_quantity: String(item.stockQuantity ?? 0),
      stock_type: item.stockType,
      is_active: item.isAvailable,
      image_url: item.image || null,
    });
    setFormErrors({});
    setImagePreview(item.image || null);
    setIsFormOpen(true);
  }

  function validateForm(): boolean {
    const nextErrors: Partial<Record<keyof ItemForm, string>> = {};
    if (!form.name.trim()) nextErrors.name = 'Item name is required.';
    const price = Number(form.selling_price);
    if (!form.selling_price || !Number.isFinite(price) || price <= 0) nextErrors.selling_price = 'Selling price must be > 0.';
    if (!form.category.trim()) nextErrors.category = 'Category is required.';
    const qty = Number(form.stock_quantity);
    if (!Number.isInteger(qty) || qty < 0) nextErrors.stock_quantity = 'Stock quantity must be >= 0.';
    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleItemSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateForm()) return;
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
      await loadData();
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Failed to save item.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateCategory() {
    const trimmedName = newCategoryName.trim();
    if (!trimmedName) {
      setErrorMessage('Category name is required.');
      return;
    }

    // Check for redundant category
    const isRedundant = categories.some(
      (cat) => cat.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (isRedundant) {
      setErrorMessage(`Category "${trimmedName}" already exists.`);
      return;
    }

    setIsCategorySaving(true);
    try {
      await apiClient.post('/categories', { name: trimmedName });
      setNewCategoryName('');
      setIsCategoryDialogOpen(false);
      await loadData();
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Failed to create category.');
    } finally {
      setIsCategorySaving(false);
    }
  }

  async function handleAddTable() {
    if (!newTableNumber.trim()) return;
    setIsAddingTable(true);
    try {
      await apiClient.post('/tables', { 
        table_number: newTableNumber.trim(),
        capacity: Number(newTableCapacity)
      });
      setNewTableNumber('');
      setIsAddTableDialogOpen(false);
      await loadData();
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Failed to add table.');
    } finally {
      setIsAddingTable(false);
    }
  }

  useEffect(() => {
    console.log('Filtering items - Active Category:', activeCategory, 'Search Query:', searchQuery);
    console.log('Total items available:', items.length);
    
    let result = items;
    if (activeCategory !== 'all') {
      result = result.filter(item => item.categoryId === activeCategory);
      console.log('Items after category filter:', result.length);
    }
    if (searchQuery) {
      result = result.filter(item => 
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      console.log('Items after search filter:', result.length);
    }
    setFilteredItems(result);
    console.log('Final filtered items:', result);
  }, [activeCategory, searchQuery, items, categories]);

  const addToCart = (item: MenuItem) => {
    if (item.stockType === 'limited') {
      const existingQty = cart.find((i) => i.id === item.id)?.quantity ?? 0;
      if (existingQty >= item.stockQuantity) {
        return;
      }
    }

    console.log('Adding item to cart:', item);
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        console.log('Item already exists, updating quantity');
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      console.log('Adding new item to cart');
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => prev.filter(i => i.id !== itemId));
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.id === itemId) {
        const maxQty = i.stockType === 'limited' ? i.stockQuantity : Number.MAX_SAFE_INTEGER;
        const newQty = Math.max(0, Math.min(maxQty, i.quantity + delta));
        return { ...i, quantity: newQty };
      }
      return i;
    }).filter(i => i.quantity > 0));
  };

  const totals = useMemo(() => {
    // Combine items from existing orders and current cart for billing calculation
    const allItemsToBill: Array<{ id: string; price: number; quantity: number; name: string; categoryId: string; gstRate?: number }> = [];
    
    // Add items from existing orders
    existingOrders.forEach((o: any) => {
      (o.items || []).forEach((oi: any) => {
        const existing = allItemsToBill.find(i => i.id === String(oi.item_id));
        if (existing) {
          existing.quantity += oi.quantity;
        } else {
          allItemsToBill.push({
            id: String(oi.item_id),
            name: oi.item_name || `Item #${oi.item_id}`,
            price: Number(oi.price_at_billing),
            quantity: oi.quantity,
            categoryId: '', // We use explicit gstRate from order item
            gstRate: Number(oi.gst_percent_at_billing)
          });
        }
      });
    });

    // Add items from current cart
    cart.forEach(item => {
      const existing = allItemsToBill.find(i => i.id === item.id);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        allItemsToBill.push({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          categoryId: item.categoryId,
          gstRate: item.gstRate
        });
      }
    });

    const subtotal = allItemsToBill.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    
    let discountAmount = 0;
    if (discountType === 'Percentage (%)') {
      discountAmount = (subtotal * discountValue) / 100;
    } else {
      discountAmount = discountValue;
    }

    const subtotalAfterDiscount = subtotal - discountAmount;
    
    // Calculate GST per item based on category or item-specific GST
    const gstBreakdown: { [rate: number]: number } = {};
    let totalGst = 0;
    
    allItemsToBill.forEach(item => {
      const itemSubtotal = item.price * item.quantity;
      const itemDiscount = (discountType === 'Percentage (%)') ? (itemSubtotal * discountValue) / 100 : (discountValue * itemSubtotal / subtotal);
      const itemSubtotalAfterDiscount = itemSubtotal - itemDiscount;
      
      // Use item-specific GST if available, otherwise use category GST
      const itemGstRate = item.gstRate || gstRates[item.categoryId] || 0;
      const itemGst = (itemSubtotalAfterDiscount * itemGstRate) / 100;
      
      gstBreakdown[itemGstRate] = (gstBreakdown[itemGstRate] || 0) + itemGst;
      totalGst += itemGst;
    });
    
    const cgstSGST = totalGst / 2;
    const total = subtotalAfterDiscount + totalGst;

    return { 
      subtotal,
      allItemsToBill,
      discountAmount, 
      totalGst, 
      cgstSGST,
      total,
      gstBreakdown
    };
  }, [cart, existingOrders, discountType, discountValue, gstRates]);
  const handlePlaceOrder = async () => {
    if (cart.length === 0) return;
    if (!selectedTable) {
      setOrderError('Please select a table before placing an order.');
      return;
    }
    setIsPlacingOrder(true);
    setOrderError(null);
    try {
      // POST to real DB via API
      const result = await apiClient.post(`/tables/${selectedTable}/orders`, {
        items: cart.map(item => ({ id: Number(item.id), quantity: item.quantity })),
      });
      const newOrderId = result.data.order_id;
      setOrderId(newOrderId);
      setIsOrderPlaced(true);
      // Send to kitchen
      try { await apiClient.post(`/orders/${newOrderId}/send-to-kitchen`); } catch (e) {}
      setCart([]);
      fetchTableOrders(selectedTable); // Refresh existing orders for the table
      alert(`Order placed successfully! Order ID: ${newOrderId.slice(0, 8).toUpperCase()}`);
    } catch (error: any) {
      const msg = error?.response?.data?.message || 'Failed to place order. Check your connection.';
      setOrderError(msg);
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const generateBillAndPrint = async () => {
    // Check if there is anything to bill (either in cart or already ordered)
    if (cart.length === 0 && existingOrders.length === 0) return;
    
    setIsGeneratingBill(true);
    try {
      // Get all order IDs for this table
      const orderIds = existingOrders.map(o => o.order_id);

      // 1. Generate real bill on server
      const response = await apiClient.post('/bills', {
        cashier_id: 1, 
        table_id: selectedTable,
        order_ids: orderIds,
        items: totals.allItemsToBill.map(item => ({
          item_id: Number(item.id),
          quantity: item.quantity
        }))
      });
      
      const billData = response.data;
      const layout = receiptLayout || {
        header_text: 'RestroManager Hotel',
        footer_text: 'Thank you for visiting!',
        logo_url: null,
        show_gst_breakdown: true
      };

      // 2. Prepare receipt data from server response
      const data: ReceiptData = {
        bill_serial_number: billData.bill.bill_serial_number,
        created_at: billData.bill.created_at,
        header_text: layout.header_text,
        footer_text: layout.footer_text,
        logo_url: layout.logo_url,
        show_gst_breakdown: layout.show_gst_breakdown,
        items: billData.items.map((item: any) => ({
          item_name: item.item_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          gst_rate: item.gst_rate,
          gst_amount: item.gst_amount,
          line_total: item.unit_price * item.quantity // Subtotal without GST as per PRD 1.2
        })),
        subtotal: billData.bill.subtotal,
        gst_total: billData.bill.gst_total,
        grand_total: billData.bill.grand_total
      };

      setReceiptData(data);
      setOrderId(`BILL-${billData.bill.bill_serial_number}`);
      setIsReceiptOpen(true);
      setActiveWorkflow('receipt');
      
      // Auto-redirect to POS after 15 seconds
      setAutoRedirectTimer(15);
      const timer = setInterval(() => {
        setAutoRedirectTimer((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(timer);
            if (prev === 1) {
              setIsReceiptOpen(false);
              handleNewBill();
              loadData(); // Refresh tables
            }
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      
    } catch (error: any) {
      console.error('Failed to generate bill:', error);
      alert(error?.response?.data?.message ?? 'Failed to generate bill. Please check your connection.');
    } finally {
      setIsGeneratingBill(false);
    }
  };

  // Effect to trigger print when receipt data is loaded and dialog is open
  useEffect(() => {
    if (isReceiptOpen && receiptData) {
      const timer = setTimeout(() => {
        window.print();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isReceiptOpen, receiptData]);

  const handleShare = (method: 'whatsapp' | 'email') => {
    const message = `Order ID: ${orderId}\nTotal: Rs ${totals.total.toFixed(2)}`;
    if (method === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    } else {
      window.location.href = `mailto:?subject=Bill Receipt&body=${encodeURIComponent(message)}`;
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex h-full items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </DashboardLayout>
    );
  }

  const renderWorkflowContent = () => {
    switch (activeWorkflow) {
      case 'categories':
        return (
          <div className="flex flex-col h-full">
            {/* Categories Bar */}
            <div className="bg-white border-b px-6 py-3">
              <div className="flex gap-2 overflow-x-auto">
                <Button 
                  variant={activeCategory === 'all' ? 'default' : 'outline'}
                  className={cn("rounded-lg px-4 h-8 text-xs", activeCategory === 'all' && "bg-blue-500 text-white")}
                  onClick={() => setActiveCategory('all')}
                >
                  All
                </Button>
                {categories.map(cat => (
                  <Button 
                    key={cat.id}
                    variant={activeCategory === cat.id ? 'default' : 'outline'}
                    className={cn("rounded-lg px-4 h-8 text-xs", activeCategory === cat.id && "bg-blue-500 text-white")}
                    onClick={() => setActiveCategory(cat.id)}
                  >
                    {cat.name}
                  </Button>
                ))}
              </div>
            </div>

            {/* Items Grid */}
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 hover:scrollbar-thumb-gray-400 p-6">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredItems.map(item => {
                  const itemGstRate = item.gstRate || gstRates[item.categoryId] || 0;
                  const isInCart = cart.find(cartItem => cartItem.id === item.id);
                  return (
                    <Card 
                      key={item.id} 
                      className={cn(
                        "bg-white border shadow-sm hover:shadow-lg transition-all group relative",
                        isInCart && "ring-2 ring-blue-500"
                      )}
                    >
                      {isInCart && (
                        <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold z-10">
                          {isInCart.quantity}
                        </div>
                      )}
                      <div className="aspect-square relative bg-gray-100 overflow-hidden">
                        <img 
                          src={item.image || `https://api.dicebear.com/7.x/initials/svg?seed=${item.name}`} 
                          alt={item.name} 
                          className="object-cover w-full h-full group-hover:scale-105 transition-transform"
                        />
                      </div>
                      <CardContent className="p-3">
                        <h3 className="font-semibold text-sm truncate">{item.name}</h3>
                        <p className="text-blue-600 font-bold text-sm">Rs {item.price}</p>
                        <p className="text-xs text-gray-500">GST: {itemGstRate}%</p>
                        
                        {/* Quantity Controls */}
                        {isInCart ? (
                          <div className="flex items-center gap-1 mt-2">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                updateQuantity(item.id, -1);
                              }}
                              className="w-6 h-6 rounded bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-600"
                            >
                              <Minus size={10} />
                            </button>
                            <span className="w-8 text-center text-sm font-medium">{isInCart.quantity}</span>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                updateQuantity(item.id, 1);
                              }}
                              className="w-6 h-6 rounded bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-600"
                            >
                              <Plus size={10} />
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              addToCart(item);
                            }}
                            className="w-full mt-2 bg-blue-500 hover:bg-blue-600 text-white text-sm py-1 rounded"
                          >
                            Add to Cart
                          </button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
        );

      case 'catalog':
        return (
          <div className="flex flex-col h-full">
            {/* Categories Bar */}
            <div className="bg-white border-b px-6 py-3">
              <div className="flex gap-2 overflow-x-auto">
                <Button 
                  variant={activeCategory === 'all' ? 'default' : 'outline'}
                  className={cn("rounded-lg px-4 h-8 text-xs", activeCategory === 'all' && "bg-blue-500 text-white")}
                  onClick={() => setActiveCategory('all')}
                >
                  All Items
                </Button>
                {categories.map((cat) => (
                  <Button 
                    key={cat.id}
                    variant={activeCategory === cat.id ? 'default' : 'outline'}
                    className={cn("rounded-lg px-4 h-8 text-xs transition-all", activeCategory === cat.id && "bg-blue-500 text-white shadow-md")}
                    onClick={() => setActiveCategory(cat.id)}
                  >
                    {cat.name}
                  </Button>
                ))}
              </div>
            </div>

            <div className="bg-white border-b px-6 py-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Item Catalog</h2>
                <p className="text-sm text-gray-600">Add or Manage items and categories.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={openCreateModal} className="gap-2">
                  <Plus size={14} /> Add Item
                </Button>
                <Button variant="outline" size="sm" onClick={() => setIsCategoryDialogOpen(true)} className="gap-2">
                  <Plus size={14} /> Add Category
                </Button>
                <div className="text-sm text-gray-500 ml-4">{filteredItems.length} items</div>
              </div>
            </div>

            {errorMessage && (
              <div className="m-6 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg flex items-center justify-between">
                <p className="text-sm font-medium">{errorMessage}</p>
                <button onClick={() => setErrorMessage(null)}>
                  <X size={16} />
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 hover:scrollbar-thumb-gray-400 p-6">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredItems.map(item => {
                  const itemGstRate = item.gstRate || gstRates[item.categoryId] || 0;
                  const isInCart = cart.find(cartItem => cartItem.id === item.id);
                  const categoryLabel = categories.find(cat => cat.id === item.categoryId)?.name ?? 'Uncategorized';

                  return (
                    <Card
                      key={item.id}
                      className={cn(
                        "bg-white border shadow-sm hover:shadow-lg transition-all group relative",
                        isInCart && "ring-2 ring-blue-500"
                      )}
                    >
                      {isInCart && (
                        <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold z-10">
                          {isInCart.quantity}
                        </div>
                      )}
                      
                      <button 
                        onClick={(e) => { e.stopPropagation(); openEditModal(item); }}
                        className="absolute top-2 left-2 bg-white/90 p-1.5 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-white text-gray-700"
                        title="Edit Item"
                      >
                        <Pencil size={14} />
                      </button>

                      <div className="aspect-square relative bg-gray-100 overflow-hidden">
                        <img
                          src={item.image || `https://api.dicebear.com/7.x/initials/svg?seed=${item.name}`}
                          alt={item.name}
                          className="object-cover w-full h-full group-hover:scale-105 transition-transform"
                        />
                      </div>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-semibold text-sm truncate">{item.name}</h3>
                            <p className="text-xs text-gray-500 truncate">{categoryLabel}</p>
                          </div>
                          <span className={cn(
                            "text-[10px] px-2 py-1 rounded-full font-medium whitespace-nowrap",
                            item.isAvailable ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                          )}>
                            {item.isAvailable ? 'Available' : 'Inactive'}
                          </span>
                        </div>
                        <p className="text-blue-600 font-bold text-sm mt-1">Rs {item.price}</p>
                        <p className="text-xs text-gray-500">Stock: {item.stockType === 'limited' ? item.stockQuantity : 'Unlimited'}</p>

                        <div className="mt-2">
                        {item.isAvailable && (
                          isInCart ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateQuantity(item.id, -1);
                                }}
                                className="w-6 h-6 rounded bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-600"
                              >
                                <Minus size={10} />
                              </button>
                              <span className="w-8 text-center text-sm font-medium">{isInCart.quantity}</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateQuantity(item.id, 1);
                                }}
                                className="w-6 h-6 rounded bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-600"
                              >
                                <Plus size={10} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                addToCart(item);
                              }}
                              className="w-full bg-blue-500 hover:bg-blue-600 text-white text-sm py-1 rounded"
                            >
                              Add to Cart
                            </button>
                          )
                        )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
        );

      case 'summary':
        return (
          <div className="flex flex-col gap-4 h-full">
            {/* Selected Items with Bill Layout */}
            <Card className="border shadow-sm flex-1">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-lg">Current Bill</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => setActiveWorkflow('categories')} className="gap-2">
                    <Plus size={14} /> Add Item
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Table Header */}
                <div className="grid grid-cols-12 text-sm font-medium text-gray-600 pb-2 border-b">
                  <div className="col-span-6">Item</div>
                  <div className="col-span-2 text-center">Qty</div>
                  <div className="col-span-2 text-right">Rate</div>
                  <div className="col-span-2 text-right">Amount</div>
                </div>
                
                {/* Items List */}
                <div className="space-y-2">
                  {cart.map(item => {
                    const itemGstRate = item.gstRate || gstRates[item.categoryId] || 0;
                    const itemSubtotal = item.price * item.quantity;
                    return (
                      <div key={item.id} className="grid grid-cols-12 items-center py-2 border-b">
                        <div className="col-span-6">
                          <h4 className="font-medium text-sm">{item.name}</h4>
                          <p className="text-xs text-gray-500">GST: {itemGstRate}%</p>
                        </div>
                        <div className="col-span-2 text-center text-sm">{item.quantity}</div>
                        <div className="col-span-2 text-right text-sm">Rs {item.price}</div>
                        <div className="col-span-2 text-right flex items-center justify-between">
                          <span className="font-semibold text-sm">Rs {itemSubtotal.toFixed(2)}</span>
                          <button onClick={() => removeFromCart(item.id)} className="text-red-500 hover:text-red-700 ml-2">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* GST Breakdown */}
                {Object.keys(totals.gstBreakdown).length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <h4 className="font-medium text-sm mb-2">GST Breakdown</h4>
                    <div className="space-y-1">
                      {Object.entries(totals.gstBreakdown).map(([rate, amount]) => (
                        <div key={rate} className="flex justify-between text-sm text-gray-600">
                          <span>GST @ {rate}%</span>
                          <span>Rs {amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );

      case 'gst':
        return (
          <div className="flex flex-col gap-4 h-full">
            {/* GST Rates Display */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">GST Rates (Read-Only)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {categories.map(cat => (
                    <div key={cat.id} className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">{cat.name}</label>
                      <div className="flex items-center gap-2">
                        <Input 
                          type="number" 
                          value={gstRates[cat.id] || cat.defaultGst}
                          disabled
                          className="h-9 text-sm bg-gray-100"
                          min="0"
                          max="100"
                          step="0.5"
                        />
                        <span className="text-sm font-medium">%</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  GST rates are configured in Settings → GST Configuration
                </p>
              </CardContent>
            </Card>

            {/* Discount Settings */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Discount Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Discount Type</label>
                    <select 
                      className="w-full h-10 px-3 rounded-lg border bg-white"
                      value={discountType}
                      onChange={(e) => setDiscountType(e.target.value)}
                    >
                      <option>Percentage (%)</option>
                      <option>Fixed Amount (Rs)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Value</label>
                    <Input 
                      type="number" 
                      value={discountValue} 
                      onChange={(e) => setDiscountValue(Number(e.target.value))}
                      className="h-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">GSTIN</label>
                  <Input 
                    value={gstin} 
                    onChange={(e) => setGstin(e.target.value)}
                    className="h-10"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'receipt':
        return (
          <div className="flex flex-col items-center justify-center h-full bg-gray-50 rounded-lg p-8">
            <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
              <div className="text-center mb-6">
                <h3 className="text-xl font-bold text-primary">RestoBill</h3>
                <p className="text-xs text-gray-600">MG Road, Bangalore</p>
                <p className="text-xs text-gray-600">GSTIN: {gstin}</p>
                <div className="border-t border-b border-dashed my-4 py-2">
                  <p className="text-xs font-semibold">Bill #: {orderId || '1024'}</p>
                  <p className="text-xs">{formatDate(new Date())}</p>
                  <p className="text-xs">{selectedTable} | {orderType}</p>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                {cart.map(item => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span>{item.name} x {item.quantity}</span>
                    <span>Rs {(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-dashed pt-4 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>Rs {totals.subtotal.toFixed(2)}</span>
                </div>
                {/* GST Breakdown */}
                {Object.entries(totals.gstBreakdown).map(([rate, amount]) => (
                  <div key={rate} className="flex justify-between">
                    <span>GST {rate}%</span>
                    <span>Rs {amount.toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between">
                  <span>CGST</span>
                  <span>Rs {totals.cgstSGST.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>SGST</span>
                  <span>Rs {totals.cgstSGST.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg pt-2 border-t">
                  <span>TOTAL</span>
                  <span className="text-primary">Rs {totals.total.toFixed(2)}</span>
                </div>
              </div>

              <div className="text-center mt-6 text-xs text-gray-600">
                <p>Thank you! Visit Again</p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button className="gap-2" onClick={() => window.print()}>
                <Printer size={16} /> Print
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => handleShare('whatsapp')}>
                <Share2 size={16} /> WhatsApp
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => handleShare('email')}>
                <Share2 size={16} /> Email
              </Button>
              <Button onClick={handleNewBill} className="bg-red-500 hover:bg-red-600 text-white gap-2">
                <Plus size={16} /> New Bill
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => setActiveWorkflow('categories')}>
                Exit
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const renderSidebar = () => {
    if (activeWorkflow === 'categories' || activeWorkflow === 'catalog' || activeWorkflow === 'summary') {
      return (
        <div className="flex flex-col h-full">
          {/* Table Management Section - Based on Workflow Diagram */}
          <div className="border-b bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <UtensilsCrossed size={14} className="text-blue-500" />
                Table Selection
              </h3>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 text-blue-500 hover:bg-blue-50"
                onClick={() => setIsAddTableDialogOpen(true)}
              >
                <Plus size={14} />
              </Button>
            </div>
            
            <div className="grid grid-cols-4 gap-2 max-h-32 overflow-y-auto pr-1 scrollbar-thin">
              {dbTables.map((t) => (
                <button
                  key={t.table_id}
                  onClick={() => {
                    setSelectedTable(t.table_id);
                    setSelectedTableLabel(`Table ${t.table_number}`);
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center py-2 rounded-md border transition-all text-[10px] font-bold",
                    selectedTable === t.table_id
                      ? "bg-blue-500 text-white border-blue-600 shadow-sm scale-95"
                      : t.status === 'occupied'
                        ? "bg-amber-50 text-amber-600 border-amber-200"
                        : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                  )}
                >
                  <span className="text-xs">T{t.table_number}</span>
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full mt-1",
                    t.status === 'occupied' ? "bg-amber-500" : "bg-emerald-500"
                  )} />
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <div>
                <label className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1 block">Order Type</label>
                <select 
                  className="w-full h-8 px-2 rounded border border-gray-300 bg-white text-xs font-medium"
                  value={orderType}
                  onChange={(e) => setOrderType(e.target.value)}
                >
                  <option>Dine In</option>
                  <option>Take Away</option>
                  <option>Delivery</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1 block">Waiter</label>
                <select 
                  className="w-full h-8 px-2 rounded border border-gray-300 bg-white text-xs font-medium"
                  value={selectedWaiter}
                  onChange={(e) => setSelectedWaiter(e.target.value)}
                >
                  <option>John Paul</option>
                  <option>Sarah Doe</option>
                </select>
              </div>
            </div>
          </div>

          {/* Order Summary Section with Items */}
          <div className="flex-1 border-b bg-white flex flex-col min-h-0">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <ShoppingCart size={14} className="text-blue-500" />
                Current Order
              </h3>
              {selectedTable && (
                <Badge variant="outline" className="text-[10px] border-blue-200 text-blue-600 px-2 py-0">
                  {selectedTableLabel}
                </Badge>
              )}
            </div>
            
            {/* Running Orders for Occupied Table */}
            {existingOrders.length > 0 && (
              <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 max-h-40 overflow-y-auto">
                <h4 className="text-[10px] font-bold text-amber-800 uppercase mb-2 flex items-center justify-between">
                  Running Orders
                  <span className="bg-amber-200 text-amber-800 px-1.5 rounded-full">{existingOrders.length}</span>
                </h4>
                <div className="space-y-2">
                  {existingOrders.map((order: any, idx: number) => (
                    <div key={order.order_id || idx} className="text-[11px] border-l-2 border-amber-300 pl-2 py-1">
                      <div className="flex justify-between font-medium">
                        <span>Order #{order.order_id?.slice(-4).toUpperCase()}</span>
                        <span className="text-amber-600">{order.status}</span>
                      </div>
                      <div className="text-gray-500">
                        {order.items?.map((item: any, idx: number) => (
                          <div key={item.id || `running-item-${idx}`} className="flex justify-between">
                            <span>• {item.name || item.item_name}</span>
                            <span>x{item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {isLoadingOrders && (
              <div className="p-4 text-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mx-auto" />
                <p className="text-[10px] text-gray-400 mt-1">Loading running orders...</p>
              </div>
            )}

            {/* Items List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {cart.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No items in cart</p>
              ) : (
                cart.map(item => {
                  const itemGstRate = item.gstRate || gstRates[item.categoryId] || 0;
                  const itemSubtotal = item.price * item.quantity;
                  return (
                    <div key={item.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <div className="flex-1">
                        <h4 className="text-sm font-medium">{item.name}</h4>
                        <p className="text-xs text-gray-500">Rs {item.price} x {item.quantity}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <button 
                            onClick={() => updateQuantity(item.id, -1)}
                            className="w-6 h-6 rounded bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-600"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                          <button 
                            onClick={() => updateQuantity(item.id, 1)}
                            className="w-6 h-6 rounded bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-600"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                        <span className="text-sm font-semibold">Rs {itemSubtotal.toFixed(2)}</span>
                        <button 
                          onClick={() => removeFromCart(item.id)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Place Order Section */}
          <div className="bg-white p-4 border-t space-y-3">
            {/* Totals moved here */}
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium">Rs {totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">GST</span>
                <span className="font-medium">Rs {totals.totalGst.toFixed(2)}</span>
              </div>
              {discountValue > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Discount</span>
                  <span className="font-medium">-Rs {totals.discountAmount.toFixed(2)}</span>
                </div>
              )}
              
              <div className="pt-2 border-t">
                <div className="flex justify-between font-bold">
                  <span>Total</span>
                  <span className="text-blue-600 text-lg">Rs {totals.total.toFixed(2)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <Button 
                  variant="outline" 
                  className="w-full justify-center gap-2 h-8 text-[10px]"
                  onClick={() => setShowWipDialog(true)}
                >
                  <CheckCircle2 size={12} /> View Details
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-center gap-2 h-8 text-[10px]"
                  onClick={() => setShowWipDialog(true)}
                >
                  <Percent size={12} /> GST Rates
                </Button>
              </div>
            </div>

            {orderError && (
              <p className="text-xs text-red-500 text-center">{orderError}</p>
            )}
            <Button 
              onClick={handlePlaceOrder}
              disabled={cart.length === 0 || isPlacingOrder || !selectedTable}
              className="w-full h-12 bg-blue-500 hover:bg-blue-600 text-white font-semibold"
            >
              {isPlacingOrder ? 'Placing Order...' : 'Place Order'}
            </Button>
            <Button 
              onClick={() => setIsPreviewOpen(true)}
              disabled={(cart.length === 0 && existingOrders.length === 0) || isGeneratingBill || !selectedTable}
              className="w-full h-12 bg-green-500 hover:bg-green-600 text-white font-semibold"
            >
              {isGeneratingBill ? 'Generating...' : 'Bill'}
            </Button>
          </div>
        </div>
      );
    }

    if (activeWorkflow === 'gst') {
      return (
        <div className="flex flex-col gap-4 h-full">
          <Card className="border shadow-sm flex-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Bill Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Subtotal</span>
                <span>Rs {totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-green-600">
                <span>Discount ({discountValue}{discountType === 'Percentage (%)' ? '%' : 'Rs'})</span>
                <span>-Rs {totals.discountAmount.toFixed(2)}</span>
              </div>
              {/* GST Breakdown */}
              {Object.entries(totals.gstBreakdown).map(([rate, amount]) => (
                <div key={rate} className="flex justify-between text-sm">
                  <span>GST ({rate}%)</span>
                  <span>Rs {amount.toFixed(2)}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm text-gray-600 pl-4">
                <span>CGST (Total)</span>
                <span>Rs {totals.cgstSGST.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600 pl-4">
                <span>SGST (Total)</span>
                <span>Rs {totals.cgstSGST.toFixed(2)}</span>
              </div>
              <div className="pt-3 border-t flex justify-between font-bold text-lg">
                <span>Grand Total</span>
                <span className="text-primary">Rs {totals.total.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>
          <Button 
            onClick={() => setActiveWorkflow('payment')}
            className="w-full h-10"
          >
            Proceed to Payment
          </Button>
        </div>
      );
    }
  };

  return (
    <RoleGuard allowedRoles={['superadmin', 'admin', 'staff']}>
      <DashboardLayout>
        <div className="flex flex-col h-[calc(100vh-120px)]">
          {/* Header Section */}
          <div className="bg-white border-b px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">POS Billing</h1>
                <p className="text-sm text-gray-600">RestoBill Restaurant</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <Input 
                    placeholder="Search items..." 
                    className="pl-10 h-10 w-64"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Button size="sm" onClick={openCreateModal} className="h-10 gap-2">
                  <Plus size={16} /> Add Item
                </Button>
                <Button variant="outline" size="sm" onClick={() => setIsCategoryDialogOpen(true)} className="h-10 gap-2">
                  <Plus size={16} /> Add Category
                </Button>
                <Button 
                  onClick={handleNewBill}
                  className="h-10 gap-2"
                >
                  <Plus size={18} />
                  New Bill
                </Button>
              </div>
            </div>
          </div>

          {/* Tabs Section */}
          <div className="bg-white border-b">
            <div className="flex">
              {workflowTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => tab.id === 'categories' ? setActiveWorkflow(tab.id) : setShowWipDialog(true)}
                  className={cn(
                    "px-6 py-3 text-sm font-medium border-b-2 transition-all",
                    activeWorkflow === tab.id 
                      ? "border-blue-500 text-blue-600 bg-blue-50" 
                      : "border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add New Category</DialogTitle>
                <DialogDescription>
                  Enter a name for the new category.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Category Name</label>
                  <Input
                    placeholder="e.g. Beverages, Main Course"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreateCategory} disabled={isCategorySaving}>
                  {isCategorySaving ? 'Saving...' : 'Create Category'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isAddTableDialogOpen} onOpenChange={setIsAddTableDialogOpen}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add New Table</DialogTitle>
                <DialogDescription>
                  Quickly add a table to the floor plan.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Table Number</label>
                  <Input
                    placeholder="e.g. 11"
                    value={newTableNumber}
                    onChange={(e) => setNewTableNumber(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Capacity (Seats)</label>
                  <Input
                    type="number"
                    value={newTableCapacity}
                    onChange={(e) => setNewTableCapacity(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddTableDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleAddTable} disabled={isAddingTable}>
                  {isAddingTable ? 'Adding...' : 'Add Table'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingItem ? 'Edit Item' : 'Add New Item'}</DialogTitle>
                <DialogDescription>
                  {editingItem ? 'Update the details of this item.' : 'Fill in the details for the new item.'}
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleItemSubmit} className="space-y-4 py-4">
                <div 
                  className={cn(
                    "relative aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-colors overflow-hidden group",
                    isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:border-primary/50",
                    imagePreview && "border-none"
                  )}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleImageFile(file);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {imagePreview ? (
                    <>
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <Button type="button" variant="secondary" size="sm" className="h-8" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                          Change
                        </Button>
                        <Button type="button" variant="destructive" size="sm" className="h-8" onClick={(e) => { e.stopPropagation(); removeImage(); }}>
                          Remove
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <div className="p-3 rounded-full bg-muted">
                        {isUploadingImage ? <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /> : <ImageIcon size={24} />}
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-medium">Click or drag to upload image</p>
                        <p className="text-xs">Supports JPG, PNG (Max 500KB)</p>
                      </div>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImageFile(file); }} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Item Name*</label>
                    <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Masala Dosa" className={formErrors.name ? "border-destructive" : ""} />
                    {formErrors.name && <p className="text-[10px] text-destructive">{formErrors.name}</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Category*</label>
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}>
                      <option value="">Select Category</option>
                      {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                    {formErrors.category && <p className="text-[10px] text-destructive">{formErrors.category}</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Selling Price (Rs)*</label>
                    <Input type="number" step="0.01" value={form.selling_price} onChange={(e) => setForm(f => ({ ...f, selling_price: e.target.value }))} placeholder="0.00" className={formErrors.selling_price ? "border-destructive" : ""} />
                    {formErrors.selling_price && <p className="text-[10px] text-destructive">{formErrors.selling_price}</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Stock Type</label>
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.stock_type} onChange={(e) => setForm(f => ({ ...f, stock_type: e.target.value as StockType }))}>
                      <option value="unlimited">Unlimited</option>
                      <option value="limited">Limited</option>
                    </select>
                  </div>
                  {form.stock_type === 'limited' && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Stock Quantity</label>
                      <Input type="number" value={form.stock_quantity} onChange={(e) => setForm(f => ({ ...f, stock_quantity: e.target.value }))} className={formErrors.stock_quantity ? "border-destructive" : ""} />
                      {formErrors.stock_quantity && <p className="text-[10px] text-destructive">{formErrors.stock_quantity}</p>}
                    </div>
                  )}
                  {editingItem && (
                    <div className="flex items-center gap-2 pt-8">
                      <input type="checkbox" id="is_active" checked={form.is_active} onChange={(e) => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded border-gray-300" />
                      <label htmlFor="is_active" className="text-sm font-medium">Available for Sale</label>
                    </div>
                  )}
                </div>

                <DialogFooter className="pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={isSaving || isUploadingImage}>
                    {isSaving ? 'Saving...' : (editingItem ? 'Update Item' : 'Create Item')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={showWipDialog} onOpenChange={setShowWipDialog}>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader>
                <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-2">
                  <UtensilsCrossed className="text-blue-600 animate-pulse" size={24} />
                </div>
                <DialogTitle className="text-center text-xl">Work in Progress!</DialogTitle>
                <DialogDescription className="text-center text-gray-500 pt-2">
                  This feature is currently under active development. We're refining the experience to make your hotel management faster and smoother.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="sm:justify-center border-t pt-4">
                <Button 
                  onClick={() => setShowWipDialog(false)} 
                  className="bg-blue-600 text-white hover:bg-blue-700 font-semibold px-8"
                >
                  Understood
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Content Section */}
          <div className="flex-1 flex">
            {activeWorkflow !== 'receipt' ? (
              <>
                {/* Main Content Area */}
                <div className="flex-1 bg-gray-50 overflow-hidden">
                  {renderWorkflowContent()}
                </div>
                
                {/* Right Sidebar */}
                <div className="w-80 bg-white border-l overflow-hidden">
                  {renderSidebar()}
                </div>
              </>
            ) : (
              /* Receipt View - Full Width */
              <div className="flex-1 bg-gray-50">
                {renderWorkflowContent()}
              </div>
            )}
          </div>
        </div>

      </DashboardLayout>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bill Preview & Confirmation</DialogTitle>
            <DialogDescription>
              Review the items from all orders for this table before generating the final bill.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-4 py-4">
            <div className="space-y-2 border-b pb-4">
              <h4 className="text-sm font-bold uppercase text-gray-500">Table: {selectedTableLabel}</h4>
              <div className="text-xs text-gray-500">Consolidating {existingOrders.length} previous orders + current cart</div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold border-b pb-1">
                <span className="flex-[2]">Item</span>
                <span className="flex-[0.5] text-center">Qty</span>
                <span className="flex-1 text-right">Price</span>
                <span className="flex-1 text-right">Total</span>
              </div>
              {totals.allItemsToBill.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm py-1">
                  <span className="flex-[2] truncate">{item.name}</span>
                  <span className="flex-[0.5] text-center">{item.quantity}</span>
                  <span className="flex-1 text-right">₹{item.price.toFixed(2)}</span>
                  <span className="flex-1 text-right font-medium">₹{(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span>₹{totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total GST</span>
                <span>₹{totals.totalGst.toFixed(2)}</span>
              </div>
              {totals.discountAmount > 0 && (
                <div className="flex justify-between text-sm text-green-600 font-medium">
                  <span>Discount</span>
                  <span>-₹{totals.discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold border-t pt-2 text-blue-600">
                <span>Grand Total</span>
                <span>₹{totals.total.toFixed(2)}</span>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsPreviewOpen(false)} disabled={isGeneratingBill}>
              Cancel
            </Button>
            <Button 
              className="bg-green-600 hover:bg-green-700 text-white" 
              onClick={async () => {
                await generateBillAndPrint();
                setIsPreviewOpen(false);
              }}
              disabled={isGeneratingBill}
            >
              {isGeneratingBill ? 'Processing...' : 'Confirm & Generate Bill'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isReceiptOpen && receiptData && (
        <div className="fixed inset-0 z-[100] bg-white flex items-start justify-center overflow-auto p-4 md:p-10 no-print-background">
          <div className="no-print absolute top-4 right-4 flex gap-2 items-center">
            {autoRedirectTimer !== null && (
              <span className="text-xs text-gray-500 mr-2">
                Auto-closing in {autoRedirectTimer}s...
              </span>
            )}
            <Button onClick={() => window.print()}>Print Again</Button>
            <Button 
              variant="default" 
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => {
                setAutoRedirectTimer(null);
                setIsReceiptOpen(false);
                handleNewBill(); 
                loadData();
              }}
            >
              Done & New Order
            </Button>
          </div>
          <div className="print:block">
            <ReceiptPrint data={receiptData} />
          </div>
        </div>
      )}

      <style jsx global>{`
        /* Custom scrollbar styles */
        .scrollbar-thin::-webkit-scrollbar {
          width: 6px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 3px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: #c1c1c1;
          border-radius: 3px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover {
          background: #a8a8a8;
        }
        .scrollbar-thin {
          scrollbar-width: thin;
          scrollbar-color: #c1c1c1 #f1f1f1;
        }
      `}</style>
    </RoleGuard>
  );
}
