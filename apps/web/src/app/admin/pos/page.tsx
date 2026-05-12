'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Percent
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  const [selectedWaiter, setSelectedWaiter] = useState('John Paul');
  const [guests, setGuests] = useState(4);
  const [activeWorkflow, setActiveWorkflow] = useState('categories');
  const [receiptLayout, setReceiptLayout] = useState<any>(null);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [isGeneratingBill, setIsGeneratingBill] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

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

  useEffect(() => {
    const loadData = async () => {
      try {
        const [catsResp, itemsResp, tablesResp] = await Promise.all([
          apiClient.get<Array<{ id: number; name: string }>>('/categories'),
          apiClient.get<Array<{
            id: number; category: string; name: string; selling_price: string;
            stock_type: 'limited' | 'unlimited'; stock_quantity: number; is_active: boolean; image_url: string | null;
          }>>('/items', { params: { is_active: 'true' } }),
          apiClient.get<Array<{ table_id: string; table_number: string; status: string }>>('/tables'),
        ]);

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
    loadData();
  }, []);

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
    const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    
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
    
    cart.forEach(item => {
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
      discountAmount, 
      totalGst, 
      cgstSGST,
      total,
      gstBreakdown
    };
  }, [cart, discountType, discountValue, gstRates]);

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
      alert(`Order placed successfully! Order ID: ${newOrderId.slice(0, 8).toUpperCase()}`);
    } catch (error: any) {
      const msg = error?.response?.data?.message || 'Failed to place order. Check your connection.';
      setOrderError(msg);
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const generateBillAndPrint = async () => {
    if (cart.length === 0) return;
    
    setIsGeneratingBill(true);
    try {
      // 1. Generate real bill on server
      const response = await apiClient.post('/bills', {
        cashier_id: 1, // Fallback or use auth user id if available
        items: cart.map(item => ({
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
    if (activeWorkflow === 'categories' || activeWorkflow === 'summary') {
      return (
        <div className="flex flex-col h-full">
          {/* Order Info Section - Smaller */}
          <div className="border-b bg-white p-4">
            <h3 className="text-sm font-semibold mb-3">Order Info</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-700">Type</label>
                <select 
                  className="w-full h-8 px-2 rounded border border-gray-300 bg-white text-sm"
                  value={orderType}
                  onChange={(e) => setOrderType(e.target.value)}
                >
                  <option>Dine In</option>
                  <option>Take Away</option>
                  <option>Delivery</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Table</label>
                <select
                  className="w-full h-8 px-2 rounded border border-gray-300 bg-white text-sm"
                  value={selectedTable}
                  onChange={(e) => {
                    const tbl = dbTables.find(t => t.table_id === e.target.value);
                    setSelectedTable(e.target.value);
                    setSelectedTableLabel(tbl ? `Table ${tbl.table_number}` : 'Select Table');
                  }}
                >
                  <option value="">-- Select Table --</option>
                  {dbTables.map(t => (
                    <option key={t.table_id} value={t.table_id}>
                      Table {t.table_number} ({t.status})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Waiter</label>
                <select 
                  className="w-full h-8 px-2 rounded border border-gray-300 bg-white text-sm"
                  value={selectedWaiter}
                  onChange={(e) => setSelectedWaiter(e.target.value)}
                >
                  <option>John Paul</option>
                  <option>Sarah Doe</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Guests</label>
                <Input 
                  type="number" 
                  value={guests} 
                  onChange={(e) => setGuests(Number(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Order Summary Section with Items */}
          <div className="flex-1 border-b bg-white flex flex-col">
            <div className="p-4 border-b">
              <h3 className="text-sm font-semibold">Order Summary</h3>
            </div>
            
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

            {/* Totals */}
            <div className="p-4 border-t bg-gray-50 space-y-2">
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
                  <span className="text-blue-600">Rs {totals.total.toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <Button 
                  variant="outline" 
                  className="w-full justify-start gap-2 h-8 text-sm"
                  onClick={() => setActiveWorkflow('summary')}
                >
                  <CheckCircle2 size={14} /> View Details
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start gap-2 h-8 text-sm"
                  onClick={() => setActiveWorkflow('gst')}
                >
                  <Percent size={14} /> View GST Rates
                </Button>
              </div>
            </div>
          </div>

          {/* Place Order Section */}
          <div className="flex-1 bg-white p-6 flex flex-col justify-end space-y-3">
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
              onClick={generateBillAndPrint}
              disabled={cart.length === 0 || isGeneratingBill}
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
                {activeWorkflow === 'categories' && (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <Input 
                      placeholder="Search items..." 
                      className="pl-10 h-10 w-64"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                )}
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
                  onClick={() => setActiveWorkflow(tab.id)}
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

      {isReceiptOpen && receiptData && (
        <div className="fixed inset-0 z-[100] bg-white flex items-start justify-center overflow-auto p-4 md:p-10 no-print-background">
          <div className="no-print absolute top-4 right-4 flex gap-2">
            <Button onClick={() => window.print()}>Print Again</Button>
            <Button variant="outline" onClick={() => setIsReceiptOpen(false)}>Close Preview</Button>
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
