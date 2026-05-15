'use client';

import React, { useState, useEffect } from 'react';
import { mockDb, MenuCategory, MenuItem, Table } from '@/lib/mock-api';
import { UI_CONTENT } from '@/lib/content';
import { MenuGrid } from '@/components/pos/menu-grid';
import { CategoryList } from '@/components/pos/category-list';
import { CartSummary, CartItem } from '@/components/pos/cart-summary';
import { Loader2, Search } from 'lucide-react';
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

  // Dialog states
  const [isTableDialogOpen, setIsTableDialogOpen] = useState(false);
  const [isReceiptDialogOpen, setIsReceiptDialogOpen] = useState(false);
  const [lastOrderDetails, setLastOrderDetails] = useState<any>(null);

  // Load initial data
  useEffect(() => {
    async function loadData() {
      const [cats, items, tbls] = await Promise.all([
        mockDb.getMenuCategories(),
        mockDb.getMenuItems(),
        mockDb.getTables()
      ]);
      setCategories(cats);
      setMenuItems(items);
      setTables(tbls);
      setIsLoading(false);
    }
    loadData();
  }, []);

  // Handle category change
  useEffect(() => {
    async function updateItems() {
      const items = await mockDb.getMenuItems(activeCategoryId || undefined);
      setMenuItems(items);
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

  const confirmTableSelection = (tableId: string | null) => {
    setSelectedTable(tableId);
    setIsTableDialogOpen(false);
  };

  const handlePlaceOrder = async () => {
    if (cart.length === 0) return;
    setIsPlacingOrder(true);

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Calculate tax dynamically based on item's gstRate or category default
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

      // Create an order via API
      const result = await apiClient.post(`/tables/${selectedTable}/orders`, { items: cart });

      if (result.status === 201 || result.status === 200) {
        setLastOrderDetails({ orderId: result.data.order_id, ...orderData });
        
        // Also send it to kitchen
        await apiClient.post(`/orders/${result.data.order_id}/send-to-kitchen`);
        
        setIsReceiptDialogOpen(true);
        // Reset POS state
        setCart([]);
        setSelectedTable(null);
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
              selectedTable={selectedTable}
              onSelectTable={handleSelectTable}
            />
          </div>
        </div>
      </div>

      {/* Table Selection Dialog */}
      <Dialog open={isTableDialogOpen} onOpenChange={setIsTableDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{UI_CONTENT.pos.terminal.tableSelect}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-4 py-4">
            <Button
              variant={selectedTable === null ? 'default' : 'outline'}
              className="h-24 flex flex-col gap-2 rounded-xl"
              onClick={() => confirmTableSelection(null)}
            >
              <span>{UI_CONTENT.pos.terminal.toGo}</span>
            </Button>
            {tables.map(table => (
              <Button
                key={table.id}
                variant={selectedTable === table.number ? 'default' : 'outline'}
                disabled={table.status === 'occupied' || table.status === 'reserved'}
                className="h-24 flex flex-col gap-2 rounded-xl relative"
                onClick={() => confirmTableSelection(table.number)}
              >
                <span className="text-xl font-bold">T{table.number}</span>
                <span className="text-xs text-muted-foreground">{table.capacity} Seats</span>
              </Button>
            ))}
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
