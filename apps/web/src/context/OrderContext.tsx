'use client';

import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { orderService } from '../services/orderService';
import { menuService } from '../services/menuService';
import { Table, Order, MenuItem } from '../types/customer';

interface OrderContextProps {
  tableDetails: Table | null;
  orders: Order[];
  menuItems: MenuItem[];
  categories: any[];
  loading: boolean;
  submitting: boolean;
  error: string | null;
  setError: (err: string | null) => void;
  placeOrder: (
    cartItems: any[],
    specialInstructions: string,
    orderType?: string,
    paymentOption?: string
  ) => Promise<any>;
  callWaiter: (requestType?: string) => Promise<void>;
  requestBill: () => Promise<void>;
  reloadOrders: () => Promise<void>;
}

export const OrderContext = createContext<OrderContextProps | undefined>(undefined);

export function OrderProvider({ children, tableId }: { children: ReactNode; tableId: string }) {
  const [tableDetails, setTableDetails] = useState<Table | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load menu items, categories, and table details on mount
  useEffect(() => {
    if (!tableId) return;

    async function loadInitialData() {
      try {
        setLoading(true);
        setError(null);
        
        const [tableData, cats, items] = await Promise.all([
          orderService.fetchTableDetails(tableId),
          menuService.fetchCategories(tableId),
          menuService.fetchMenuItems(tableId)
        ]);

        setTableDetails(tableData);
        if (tableData.restaurant_name && typeof window !== 'undefined') {
          localStorage.setItem('restaurant_name', tableData.restaurant_name);
        }
        setCategories(cats);
        setMenuItems(items);

        // Fetch session orders if table is already active
        if (tableData.active_session_id) {
          const sessionOrders = await orderService.fetchSessionOrders(tableId);
          setOrders(sessionOrders);
        }
      } catch (err: any) {
        console.error('Failed to load table details:', err);
        setError(err?.response?.data?.message || 'Invalid Table QR Code. Please check or scan again.');
      } finally {
        setLoading(false);
      }
    }

    loadInitialData();
  }, [tableId]);

  const reloadOrders = async () => {
    if (!tableId) return;
    try {
      const sessionOrders = await orderService.fetchSessionOrders(tableId);
      setOrders(sessionOrders);
    } catch (err) {
      console.error('Failed to reload orders:', err);
    }
  };

  const placeOrder = async (
    cartItems: any[],
    specialInstructions: string,
    orderType?: string,
    paymentOption?: string
  ) => {
    if (cartItems.length === 0) return;
    setSubmitting(true);
    setError(null);

    try {
      const itemsPayload = cartItems.map(i => ({
        id: i.id,
        quantity: i.quantity,
        gstRate: i.gst_rate || 5,
        spiceLevel: i.spiceLevel,
        extras: i.extras,
        notes: specialInstructions
      }));

      const res = await orderService.submitOrder(
        tableId,
        itemsPayload,
        orderType,
        paymentOption,
        specialInstructions
      );
      
      // Reload active orders
      await reloadOrders();
      return res;
    } catch (err: any) {
      console.error('Order submission failed:', err);
      const msg = err?.response?.data?.message || 'Failed to place order. Please call a waiter.';
      setError(msg);
      throw new Error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const callWaiter = async (requestType?: string) => {
    try {
      await orderService.callWaiterAlert(tableId, requestType);
      alert(`Waiter called${requestType ? ` for "${requestType}"` : ''}. Assistance will arrive shortly.`);
    } catch (e) {
      console.error('Failed to call waiter', e);
      alert('Failed to alert waiter. Please call staff directly.');
    }
  };

  const requestBill = async () => {
    setSubmitting(true);
    try {
      await orderService.requestBillInvoice(tableId);
      await reloadOrders();
    } catch (e: any) {
      console.error('Failed to request bill', e);
      alert(e?.response?.data?.message || 'Failed to request bill. Please call waiter.');
      throw e;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <OrderContext.Provider value={{
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
    }}>
      {children}
    </OrderContext.Provider>
  );
}
