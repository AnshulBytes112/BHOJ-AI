'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { Utensils, ShoppingCart, Clock, Bell } from 'lucide-react';
import { CartProvider } from '@/context/CartContext';
import { OrderProvider } from '@/context/OrderContext';
import { useCart } from '@/hooks/useCart';
import { useOrder } from '@/hooks/useOrder';
import { useWebSocket } from '@/hooks/useWebSocket';
import { MenuItem } from '@/types/customer';
import { cn } from '@/lib/utils';

// Import Screens
import LandingScreen from '@/components/customer/LandingScreen';
import MenuScreen from '@/components/customer/MenuScreen';
import ItemDetailsScreen from '@/components/customer/ItemDetailsScreen';
import CartScreen from '@/components/customer/CartScreen';
import CheckoutScreen from '@/components/customer/CheckoutScreen';
import OrderConfirmation from '@/components/customer/OrderConfirmation';
import OrderTracking from '@/components/customer/OrderTracking';
import OrderDetails from '@/components/customer/OrderDetails';
import CallWaiter from '@/components/customer/CallWaiter';
import RequestBill from '@/components/customer/RequestBill';
import BillSummary from '@/components/customer/BillSummary';

function CustomerMenuContent() {
  const params = useParams();
  const tableId = params?.tableId as string;

  // View state switcher
  const [activeView, setActiveView] = useState<
    'landing' | 'menu' | 'item-details' | 'cart' | 'checkout' | 'order-confirmation' | 'order-tracking' | 'order-details' | 'call-waiter' | 'request-bill' | 'bill-summary'
  >('landing');

  // Selected item details customization state
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null);
  
  // Checkout coupon calculations state
  const [discountAmount, setDiscountAmount] = useState(0);
  const [promoApplied, setPromoApplied] = useState(false);

  // Placed Order States
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  const [viewingOrderId, setViewingOrderId] = useState<string | null>(null);

  // Hooks
  const { cart, updateQuantity, clearCart, subtotal, totalCartQuantity, addToCart } = useCart();
  const { 
    tableDetails, 
    orders, 
    menuItems, 
    categories, 
    loading, 
    submitting, 
    error, 
    setError,
    placeOrder, 
    callWaiter, 
    requestBill, 
    reloadOrders 
  } = useOrder();

  // Establish live web sockets
  useWebSocket({
    tableId,
    onKotStatusUpdate: () => {
      reloadOrders();
    },
    onBillStatusUpdate: (status) => {
      if (status === 'billed') {
        setActiveView('bill-summary');
      }
    }
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto shadow-2xl">
        <Utensils className="h-16 w-16 text-emerald-800 animate-pulse mb-4" />
        <h1 className="text-xl font-bold text-gray-800">Flavors Restaurant</h1>
        <p className="text-sm text-gray-500 mt-2">Loading menu and table configuration...</p>
      </div>
    );
  }

  if (error && !tableDetails) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto shadow-2xl">
        <h1 className="text-xl font-bold text-gray-800">Scan Error</h1>
        <p className="text-sm text-red-500 mt-2">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-6 px-6 py-2 bg-emerald-800 text-white rounded-xl font-semibold shadow hover:bg-emerald-900"
        >
          Try Again
        </button>
      </div>
    );
  }

  const activeOrder = orders.find(o => o.order_id === viewingOrderId);

  return (
    <div className="min-h-screen bg-stone-100 flex justify-center">
      <div className="w-full max-w-md bg-white min-h-screen shadow-2xl flex flex-col relative overflow-hidden pb-16">
        
        {/* Render Active View */}
        {activeView === 'landing' && (
          <LandingScreen 
            tableNumber={tableDetails?.table_number || '8'} 
            onStart={() => setActiveView('menu')} 
          />
        )}

        {activeView === 'menu' && (
          <MenuScreen
            tableNumber={tableDetails?.table_number || '8'}
            categories={categories}
            menuItems={menuItems}
            cart={cart}
            subtotal={subtotal}
            totalCartQuantity={totalCartQuantity}
            onSelectItem={(item) => {
              setSelectedMenuItem(item);
              setActiveView('item-details');
            }}
            onViewCart={() => setActiveView('cart')}
          />
        )}

        {activeView === 'item-details' && selectedMenuItem && (
          <ItemDetailsScreen
            item={selectedMenuItem}
            onBack={() => {
              setSelectedMenuItem(null);
              setActiveView('menu');
            }}
            onConfirm={(spiceLevel, selectedExtras, quantity) => {
              addToCart(selectedMenuItem, quantity, spiceLevel, selectedExtras);
              setSelectedMenuItem(null);
              setActiveView('menu');
            }}
          />
        )}

        {activeView === 'cart' && (
          <CartScreen
            cart={cart}
            subtotal={subtotal}
            totalCartQuantity={totalCartQuantity}
            onBack={() => setActiveView('menu')}
            onUpdateQuantity={updateQuantity}
            onClearCart={clearCart}
            onProceed={(discount, applied) => {
              setDiscountAmount(discount);
              setPromoApplied(applied);
              setActiveView('checkout');
            }}
          />
        )}

        {activeView === 'checkout' && (
          <CheckoutScreen
            cart={cart}
            subtotal={subtotal}
            discountAmount={discountAmount}
            promoApplied={promoApplied}
            tableNumber={tableDetails?.table_number || '8'}
            onBack={() => setActiveView('cart')}
            isSubmitting={submitting}
            onPlaceOrder={async (instructions) => {
              try {
                const res = await placeOrder(cart, instructions);
                setPlacedOrderId(res.order_id);
                clearCart();
                setActiveView('order-confirmation');
              } catch (e) {
                // Error is handled inside OrderContext
              }
            }}
          />
        )}

        {activeView === 'order-confirmation' && (
          <OrderConfirmation
            orderId={placedOrderId}
            onTrack={() => setActiveView('order-tracking')}
          />
        )}

        {activeView === 'order-tracking' && (
          <OrderTracking
            orders={orders}
            onBack={() => setActiveView('menu')}
            onRefresh={reloadOrders}
            onViewOrderDetails={(orderId) => {
              setViewingOrderId(orderId);
              setActiveView('order-details');
            }}
            onCallWaiter={() => callWaiter('General assistance')}
          />
        )}

        {activeView === 'order-details' && activeOrder && (
          <OrderDetails
            order={activeOrder}
            onBack={() => setActiveView('order-tracking')}
            onCancelOrder={(orderId) => {
              if (confirm('Are you sure you want to cancel this order?')) {
                alert('Cancellation request sent. Please confirm with staff.');
              }
            }}
          />
        )}

        {activeView === 'call-waiter' && (
          <CallWaiter
            tableNumber={tableDetails?.table_number || '8'}
            onCall={(type) => callWaiter(type)}
          />
        )}

        {activeView === 'request-bill' && (
          <RequestBill
            isSubmitting={submitting}
            onConfirmRequest={async () => {
              try {
                await requestBill();
                setActiveView('bill-summary');
              } catch (e) {}
            }}
          />
        )}

        {activeView === 'bill-summary' && (
          <BillSummary
            orders={orders}
            tableNumber={tableDetails?.table_number || '8'}
          />
        )}

        {/* BOTTOM GLOBAL NAVIGATION BAR */}
        {activeView !== 'landing' && activeView !== 'item-details' && (
          <nav className="absolute bottom-0 left-0 right-0 h-16 bg-white border-t border-stone-200 flex justify-around items-center px-2 z-10 shadow-lg">
            <button
              onClick={() => setActiveView('menu')}
              className={cn(
                "flex flex-col items-center gap-1 text-[10px] font-bold transition-all px-3 py-1 rounded-xl",
                activeView === 'menu' ? "text-emerald-800" : "text-stone-400"
              )}
            >
              <Utensils size={18} />
              <span>Menu</span>
            </button>
            <button
              onClick={() => setActiveView('cart')}
              className={cn(
                "flex flex-col items-center gap-1 text-[10px] font-bold transition-all px-3 py-1 rounded-xl relative",
                activeView === 'cart' ? "text-emerald-800" : "text-stone-400"
              )}
            >
              <ShoppingCart size={18} />
              <span>Cart</span>
              {totalCartQuantity > 0 && (
                <span className="absolute top-1 right-3 bg-emerald-600 text-white text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center border border-white">
                  {totalCartQuantity}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveView('order-tracking')}
              className={cn(
                "flex flex-col items-center gap-1 text-[10px] font-bold transition-all px-3 py-1 rounded-xl",
                activeView === 'order-tracking' || activeView === 'order-details' ? "text-emerald-800" : "text-stone-400"
              )}
            >
              <Clock size={18} />
              <span>Orders</span>
            </button>
            <button
              onClick={() => setActiveView('call-waiter')}
              className={cn(
                "flex flex-col items-center gap-1 text-[10px] font-bold transition-all px-3 py-1 rounded-xl",
                activeView === 'call-waiter' ? "text-emerald-800" : "text-stone-400"
              )}
            >
              <Bell size={18} />
              <span>Call Waiter</span>
            </button>
          </nav>
        )}

      </div>
    </div>
  );
}

export default function CustomerMenuPage() {
  const params = useParams();
  const tableId = params?.tableId as string;

  return (
    <OrderProvider tableId={tableId}>
      <CartProvider tableId={tableId}>
        <CustomerMenuContent />
      </CartProvider>
    </OrderProvider>
  );
}
