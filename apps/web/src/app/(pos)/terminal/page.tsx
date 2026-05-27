'use client';

import React, { useState, useEffect } from 'react';
import { mockDb, MenuCategory, MenuItem, Table } from '@/lib/mock-api';
import { UI_CONTENT } from '@/lib/content';
import { MenuGrid } from '@/components/pos/menu-grid';
import { CategoryList } from '@/components/pos/category-list';
import { CartSummary, CartItem } from '@/components/pos/cart-summary';
import { Loader2, Search, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import apiClient from '@/services/apiClient';

export default function PosTerminalPage() {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<Table[]>([]);

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // Tracks existing open orders for the selected table (shown in cart)
  const [existingOrderId, setExistingOrderId] = useState<string | null>(null);
  const [loadingTableOrders, setLoadingTableOrders] = useState(false);

  // Dialog states
  const [isTableDialogOpen, setIsTableDialogOpen] = useState(false);
  const [isReceiptDialogOpen, setIsReceiptDialogOpen] = useState(false);
  const [lastOrderDetails, setLastOrderDetails] = useState<any>(null);

  // Table status warning (RULE 2: bill paid ≠ table free)
  const [tableStatusWarning, setTableStatusWarning] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    async function loadData() {
      try {
        const [catsRes, itemsRes, tblsRes] = await Promise.all([
          apiClient.get('/categories'),
          apiClient.get('/items'),
          apiClient.get('/tables')
        ]);
        
        const cats = catsRes.data.map((c: any) => ({
          id: c.name, 
          name: c.name,
          defaultGst: c.gst_percentage || 5
        }));

        const items = itemsRes.data.map((i: any) => ({
          id: i.id.toString(),
          categoryId: i.category,
          name: i.name,
          price: parseFloat(i.selling_price),
          description: i.description || '',
          isAvailable: i.is_active,
          gstRate: i.gst_percentage || 5
        }));

        // ✨ NEW: Map with new visual_state from API
        // visual_state includes: FREE, OCCUPIED_ACTIVE, PAYMENT_DONE_WAITING_SERVICE, BILLING_IN_PROGRESS, READY_TO_CLEAN, FORCE_ATTENTION
        const tbls = tblsRes.data.map((t: any) => ({
          id: t.table_id.toString(),
          number: t.table_number.toString(),
          capacity: t.capacity || 4,
          status: t.status === 'free' ? 'available' : 'occupied',
          // Preserve raw status for display in the table picker dialog
          rawStatus: t.status as string,
          isBillPaid: t.is_bill_paid ?? false,
          activeItemCount: t.active_item_count ?? 0,
          // ✨ NEW: Visual state for UI display
          visual_state: t.visual_state ?? 'FREE',
          active_session_id: t.active_session_id ?? null,
        }));

        setCategories(cats);
        setMenuItems(items);
        setTables(tbls);
      } catch (err) {
        console.error("Failed to load initial data", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  // Handle category change (filtering is done on client side since we fetch all items initially)
  // Or we can just let MenuGrid do it, but MenuGrid expects filtered list? Wait, in original code it calls updateItems.
  useEffect(() => {
    async function updateItems() {
      if (activeCategoryId) {
        const res = await apiClient.get(`/items?category=${encodeURIComponent(activeCategoryId)}`);
        const items = res.data.map((i: any) => ({
          id: i.id.toString(),
          categoryId: i.category,
          name: i.name,
          price: parseFloat(i.selling_price),
          description: i.description || '',
          isAvailable: i.is_active,
          gstRate: i.gst_percentage || 5
        }));
        setMenuItems(items);
      } else {
        const res = await apiClient.get('/items');
        const items = res.data.map((i: any) => ({
          id: i.id.toString(),
          categoryId: i.category,
          name: i.name,
          price: parseFloat(i.selling_price),
          description: i.description || '',
          isAvailable: i.is_active,
          gstRate: i.gst_percentage || 5
        }));
        setMenuItems(items);
      }
    }
    if (!isLoading) updateItems();
  }, [activeCategoryId, isLoading]);

  const handleAddItem = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const handleUpdateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const handleRemoveItem = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const handleSelectTable = () => {
    setIsTableDialogOpen(true);
  };

  // BUG FIX: When selecting an occupied table, fetch its existing open orders
  // and pre-populate the cart so staff can see what's already been ordered.
  // ✨ NEW: Session-scoped orders — only shows active session orders, not historical
  const confirmTableSelection = async (tableId: string | null) => {
    setSelectedTable(tableId);
    setIsTableDialogOpen(false);
    setExistingOrderId(null);
    setCart([]);

    if (!tableId) return;

    // Find the table — if it's occupied, load its existing order items
    const tbl = tables.find(t => t.id === tableId) as any;
    // Check both old 'available' status and new visual_state === 'FREE'
    if (!tbl || tbl.status === 'available' || tbl.visual_state === 'FREE') return;

    setLoadingTableOrders(true);
    try {
      const ordersRes = await apiClient.get(`/tables/${tableId}/orders`);
      // NEW: Response structure includes orders array, active_session_id, and order_count
      const response = ordersRes.data;
      const orders: any[] = Array.isArray(response) ? response : (response.orders ?? []);

      // Find the latest open order from ACTIVE SESSION ONLY
      const openOrder = orders
        .filter((o: any) => o.status === 'open' || o.status === 'sent_to_kitchen')
        .sort((a: any, b: any) => b.order_phase - a.order_phase)[0];

      if (openOrder && Array.isArray(openOrder.items) && openOrder.items.length > 0) {
        setExistingOrderId(openOrder.order_id);
        // Map the existing items into CartItem shape so staff can see them
        const cartItems: CartItem[] = openOrder.items.map((oi: any) => ({
          id: String(oi.item_id),
          name: oi.item_name,
          price: parseFloat(oi.price_at_billing ?? 0),
          quantity: oi.quantity,
          categoryId: '',
          description: '',
          isAvailable: true,
          gstRate: parseFloat(oi.gst_percent_at_billing ?? 5),
        }));
        setCart(cartItems);
      }
    } catch (err) {
      console.warn('Could not load existing table orders:', err);
    } finally {
      setLoadingTableOrders(false);
    }
  };

  const handlePlaceOrder = async () => {
    if (cart.length === 0) return;
    setIsPlacingOrder(true);
    setTableStatusWarning(null);

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = cart.reduce((sum, item) => {
      const category = categories.find(c => c.id === item.categoryId);
      const rate = item.gstRate ?? category?.defaultGst ?? 5;
      return sum + (item.price * item.quantity * (rate / 100));
    }, 0);
    const total = subtotal + tax;

    try {
      const orderData = {
        items: [...cart],
        tableId: selectedTable,
        subtotal,
        tax,
        total
      };

      // Step 1: Create order
      const result = await apiClient.post(`/tables/${selectedTable}/orders`, { items: cart });

      if (result.status === 201 || result.status === 200) {
        setLastOrderDetails({ orderId: result.data.order_id, ...orderData });

        // Step 2: Send to kitchen
        await apiClient.post(`/orders/${result.data.order_id}/send-to-kitchen`);

        // Step 3: Generate bill (pay_now=true marks it as paid immediately)
        // RULE 2: The API will NOT auto-free the table; it runs canFreeTable() validation.
        try {
          const billRes = await apiClient.post('/bills', {
            items: cart.map(i => ({ item_id: parseInt(i.id), quantity: i.quantity })),
            table_id: selectedTable,
            order_ids: [result.data.order_id],
            pay_now: true,
          });

          // Show warning if table can't be freed yet (active items remain)
          if (billRes.data.warning) {
            setTableStatusWarning(billRes.data.warning);
          }
        } catch (billErr) {
          // Bill creation is best-effort at POS
          console.warn('Bill auto-creation failed (non-fatal):', billErr);
        }

        setIsReceiptDialogOpen(true);
        setCart([]);
        setSelectedTable(null);

        // Refresh tables after order (now includes visual_state)
        const tblsRes = await apiClient.get('/tables');
        setTables(tblsRes.data.map((t: any) => ({
          id: t.table_id.toString(),
          number: t.table_number.toString(),
          capacity: t.capacity || 4,
          status: t.status === 'free' ? 'available' : 'occupied',
          rawStatus: t.status as string,
          isBillPaid: t.is_bill_paid ?? false,
          activeItemCount: t.active_item_count ?? 0,
          visual_state: t.visual_state ?? 'FREE',
          active_session_id: t.active_session_id ?? null,
        })));
      }
    } catch (error: any) {
      console.error('Failed to create order:', error);
      alert(error?.response?.data?.message || 'Failed to place order.');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-50" />
      </div>
    );
  }

  return (
    <>
      {/* Table Status Warning Banner — shown after a paid order if kitchen still active */}
      {tableStatusWarning && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm text-amber-800 shadow-sm">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <div className="font-bold">■ Bill Paid — Table CANNOT be freed yet</div>
            <div className="text-xs mt-0.5 text-amber-700">{tableStatusWarning}</div>
          </div>
          <button
            className="ml-auto text-amber-500 hover:text-amber-700 shrink-0"
            onClick={() => setTableStatusWarning(null)}
          >✕</button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row h-full gap-6 max-h-[calc(100vh-theme(spacing.24))]">

        {/* Left Area - Menu & Categories */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Search */}
          <div className="relative mb-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              className="pl-12 h-14 bg-card border-none shadow-sm rounded-xl text-lg focus-visible:ring-primary"
              placeholder={UI_CONTENT.pos.terminal.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Categories Horizontal Scroll */}
          <CategoryList
            categories={categories}
            activeCategoryId={activeCategoryId}
            onSelectCategory={setActiveCategoryId}
          />

          {/* Menu Grid */}
          <div className="flex-1 overflow-y-auto pr-2 pb-24 lg:pb-0">
            <MenuGrid items={menuItems} onAddItem={handleAddItem} searchQuery={searchQuery} />
          </div>
        </div>

        {/* Right Area - Cart */}
        <div className="w-full lg:w-[400px] shrink-0 h-full fixed lg:relative bottom-0 left-0 right-0 lg:bottom-auto z-20 transition-transform bg-background/95 backdrop-blur lg:bg-transparent p-4 lg:p-0 border-t lg:border-none shadow-2xl lg:shadow-none animate-in slide-in-from-bottom-full lg:slide-in-from-right">
          <div className="h-[50vh] lg:h-full pb-4 lg:pb-0">
            <CartSummary
              items={cart}
              onUpdateQuantity={handleUpdateQuantity}
              onRemoveItem={handleRemoveItem}
              onPlaceOrder={handlePlaceOrder}
              isLoading={isPlacingOrder}
              selectedTable={tables.find(t => t.id === selectedTable)?.number || selectedTable}
              onSelectTable={handleSelectTable}
            />
          </div>
        </div>
      </div>
      {/* Loading overlay while fetching existing table orders */}
      {loadingTableOrders && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 text-sm text-blue-700">
          <Loader2 size={16} className="animate-spin shrink-0" />
          Loading existing order for this table...
        </div>
      )}

      <Dialog open={isTableDialogOpen} onOpenChange={setIsTableDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{UI_CONTENT.pos.terminal.tableSelect}</DialogTitle>
          </DialogHeader>

          {/* Legend - NEW: Updated color mapping for visual states */}
          <div className="flex gap-3 text-xs text-muted-foreground pb-2 flex-wrap">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Free</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-purple-600 inline-block" /> Dining</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Payment Done, Waiting</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Billing</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> Alert</span>
          </div>

          <div className="grid grid-cols-3 gap-3 py-2 max-h-[400px] overflow-y-auto">
            <Button
              variant={selectedTable === null ? 'default' : 'outline'}
              className="h-24 flex flex-col gap-2 rounded-xl"
              onClick={() => confirmTableSelection(null)}
            >
              <span>{UI_CONTENT.pos.terminal.toGo}</span>
            </Button>
            {tables.map(tableRaw => {
              const table = tableRaw as any;
              const isSelected = selectedTable === table.id;
              // ✨ NEW: Use visual_state from API instead of manually deriving
              const visualState = table.visual_state || 'FREE';

              let dotColor = 'bg-emerald-500';
              let statusLabel = 'Free';
              let bgColor = '';

              // Map visual states to colors per spec
              switch (visualState) {
                case 'FREE':
                  dotColor = 'bg-emerald-500';
                  statusLabel = 'Free';
                  bgColor = '';
                  break;
                case 'OCCUPIED_ACTIVE':
                  dotColor = 'bg-purple-600';
                  statusLabel = 'Dining';
                  bgColor = 'border-purple-300 bg-purple-50 hover:bg-purple-100';
                  break;
                case 'PAYMENT_DONE_WAITING_SERVICE':
                  dotColor = 'bg-amber-500';
                  statusLabel = 'Payment Done';
                  bgColor = 'border-amber-300 bg-amber-50 hover:bg-amber-100';
                  break;
                case 'BILLING_IN_PROGRESS':
                  dotColor = 'bg-blue-500';
                  statusLabel = 'Billing';
                  bgColor = 'border-blue-300 bg-blue-50 hover:bg-blue-100';
                  break;
                case 'READY_TO_CLEAN':
                  dotColor = 'bg-teal-500';
                  statusLabel = 'Ready to Clean';
                  bgColor = 'border-teal-300 bg-teal-50 hover:bg-teal-100';
                  break;
                case 'FORCE_ATTENTION':
                  dotColor = 'bg-red-500';
                  statusLabel = 'Attention';
                  bgColor = 'border-red-300 bg-red-50 hover:bg-red-100';
                  break;
              }

              return (
                <Button
                  key={table.id}
                  variant={isSelected ? 'default' : 'outline'}
                  // ALLOW selecting occupied tables (to add more items / view existing order)
                  className={`h-24 flex flex-col gap-1 rounded-xl relative ${
                    visualState !== 'FREE' && !isSelected ? bgColor : ''
                  }`}
                  onClick={() => confirmTableSelection(table.id)}
                >
                  {/* Status dot */}
                  <span className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${dotColor}`} />
                  <span className="text-xl font-bold">T{table.number}</span>
                  <span className="text-[10px] text-muted-foreground">{statusLabel}</span>
                  {visualState !== 'FREE' && (table.activeItemCount > 0) && (
                    <span className="text-[10px] font-semibold text-amber-600">{table.activeItemCount} items</span>
                  )}
                </Button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Receipt Dialog */}
      <Dialog open={isReceiptDialogOpen} onOpenChange={setIsReceiptDialogOpen}>
        <DialogContent className="sm:max-w-md">
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
            <DialogDescription className="text-center text-xs">
              {UI_CONTENT.pos.terminal.orderSuccess}
            </DialogDescription>
          </DialogHeader>
          {lastOrderDetails && (
            <div className="flex flex-col gap-0 py-2 font-mono text-sm">
              {/* Order info - left aligned */}
              <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '8px' }}>
                <div>ORDER NO: #{lastOrderDetails.orderId}</div>
                <div>{lastOrderDetails.tableId ? `TABLE: ${lastOrderDetails.tableId}` : 'TAKEAWAY'}</div>
              </div>

              {/* Dashed separator */}
              <div style={{ borderBottom: '1px dashed #ccc', marginBottom: '8px' }} />

              {/* Items header */}
              <div className="flex justify-between text-xs font-bold" style={{ marginBottom: '4px' }}>
                <span style={{ flex: 2, textAlign: 'left' }}>ITEM</span>
                <span style={{ flex: 0.5, textAlign: 'center' }}>QTY</span>
                <span style={{ flex: 1, textAlign: 'right' }}>PRICE</span>
                <span style={{ flex: 1, textAlign: 'right' }}>TOTAL</span>
              </div>

              {/* Dashed separator */}
              <div style={{ borderBottom: '1px dashed #ccc', marginBottom: '6px' }} />

              {/* Items */}
              <div className="space-y-2" style={{ marginBottom: '8px' }}>
                {lastOrderDetails.items.map((item: CartItem) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span style={{ flex: 2, textAlign: 'left' }}>{item.name}</span>
                    <span style={{ flex: 0.5, textAlign: 'center' }}>{item.quantity}</span>
                    <span style={{ flex: 1, textAlign: 'right' }}>{item.price.toFixed(2)}</span>
                    <span style={{ flex: 1, textAlign: 'right', fontWeight: 'bold' }}>{(item.quantity * item.price).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Dashed separator */}
              <div style={{ borderBottom: '1px dashed #ccc', marginBottom: '8px' }} />

              {/* Totals */}
              <div style={{ fontSize: '13px' }}>
                <div className="flex justify-between" style={{ marginBottom: '4px' }}>
                  <span>Subtotal</span>
                  <span>Rs {lastOrderDetails.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between" style={{ marginBottom: '8px' }}>
                  <span>GST Total</span>
                  <span>Rs {lastOrderDetails.tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold" style={{
                  fontSize: '15px',
                  borderTop: '1px dashed #ccc',
                  paddingTop: '8px',
                }}>
                  <span>GRAND TOTAL</span>
                  <span>Rs {lastOrderDetails.total.toFixed(2)}</span>
                </div>
              </div>

              {/* Footer */}
              <div style={{
                textAlign: 'center',
                borderTop: '1px dashed #ccc',
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
          <DialogFooter className="sm:justify-between">
            <Button variant="outline" onClick={() => setIsReceiptDialogOpen(false)}>
              {UI_CONTENT.pos.terminal.newOrder}
            </Button>
            <Button onClick={() => {
              console.log('Printing receipt...');
              setIsReceiptDialogOpen(false);
            }}>
              {UI_CONTENT.pos.terminal.printReceipt}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
