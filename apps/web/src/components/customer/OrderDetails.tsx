'use client';

import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Order } from '../../types/customer';

interface OrderDetailsProps {
  order: Order;
  onBack: () => void;
  onCancelOrder: (orderId: string) => void;
}

export default function OrderDetails({ order, onBack, onCancelOrder }: OrderDetailsProps) {
  const subtotalVal = order.items.reduce((sum, item) => sum + parseFloat(item.price_at_billing) * item.quantity, 0);
  const taxesVal = order.items.reduce((sum, item) => {
    const itemSubtotal = parseFloat(item.price_at_billing) * item.quantity;
    const rate = parseFloat((item as any).gst_percent_at_billing ?? 5);
    return sum + (itemSubtotal * (rate / 100));
  }, 0);
  const totalVal = subtotalVal + taxesVal;

  return (
    <div className="flex-grow flex flex-col bg-white">
      {/* Header */}
      <div className="px-4 py-4 border-b border-stone-100 flex items-center gap-3 bg-white sticky top-0 z-10">
        <button 
          onClick={onBack}
          className="p-1.5 hover:bg-stone-50 rounded-lg text-gray-700"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-lg font-black text-gray-900">Order Details</h2>
      </div>

      {/* Body */}
      <div className="flex-grow flex flex-col justify-between">
        <div className="p-5 space-y-5 overflow-y-auto max-h-[calc(100vh-220px)]">
          {/* ID banner */}
          <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 flex justify-between items-center shadow-sm">
            <div>
              <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Order ID</p>
              <p className="text-sm font-black text-gray-800 mt-1">#{order.order_id.slice(0, 8).toUpperCase()}</p>
              <p className="text-[9px] text-stone-400 mt-0.5">Placed on {new Date(order.created_at).toLocaleTimeString()}</p>
            </div>
            <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full shadow-inner ${order.status === 'cancelled' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
              {order.status || 'Preparing'}
            </span>
          </div>

          {/* Item list */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Items</h3>
            <div className="space-y-2.5">
              {order.items.map((item) => (
                <div key={item.order_item_id} className="flex justify-between items-center text-sm text-gray-700">
                  <div>
                    <p className="font-semibold">{item.item_name} x {item.quantity}</p>
                    <span className="text-[9px] text-emerald-800 capitalize font-bold">{item.item_status || 'Sent'}</span>
                  </div>
                  <span className="font-bold text-gray-805">₹{parseFloat(item.price_at_billing) * item.quantity}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Calculations */}
        <div className="border-t border-stone-100 p-4 space-y-4 bg-stone-50">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-stone-500">
              <span>Subtotal</span>
              <span>₹{subtotalVal}</span>
            </div>
            <div className="flex justify-between text-xs text-stone-500">
              <span>Taxes & Charges (GST)</span>
              <span>₹{taxesVal.toFixed(2)}</span>
            </div>
            <div className="border-t border-stone-200 my-1 pt-1.5 flex justify-between font-black text-gray-900 text-base">
              <span>Total</span>
              <span>₹{totalVal.toFixed(2)}</span>
            </div>
          </div>

          {order.order_status === 'open' && (
            <button
              onClick={() => onCancelOrder(order.order_id)}
              className="w-full border border-red-200 text-red-500 py-3.5 rounded-xl font-bold text-xs shadow-sm hover:bg-red-50 hover:border-red-300"
            >
              Cancel Order
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
