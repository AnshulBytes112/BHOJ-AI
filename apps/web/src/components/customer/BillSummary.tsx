'use client';

import React from 'react';
import { Receipt, Heart } from 'lucide-react';
import { Order } from '../../types/customer';

interface BillSummaryProps {
  orders: Order[];
  tableNumber: string;
}

export default function BillSummary({ orders, tableNumber }: BillSummaryProps) {
  // Combine all items from all orders in the current session
  const allItems: { name: string; qty: number; price: number }[] = [];
  
  orders.forEach(order => {
    order.items.forEach(item => {
      const match = allItems.find(i => i.name === item.item_name);
      if (match) {
        match.qty += item.quantity;
      } else {
        allItems.push({
          name: item.item_name,
          qty: item.quantity,
          price: parseFloat(item.price_at_billing)
        });
      }
    });
  });

  const billSubtotal = allItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const billTaxes = billSubtotal * 0.10;
  const billTotal = billSubtotal + billTaxes;

  return (
    <div className="flex-grow flex flex-col bg-white">
      {/* Header */}
      <div className="px-4 py-4 border-b border-stone-100 flex items-center gap-3 bg-white sticky top-0 z-10">
        <h2 className="text-lg font-black text-gray-900 mx-auto">Bill Summary</h2>
      </div>

      {/* Receipt list */}
      {orders.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-stone-400">
          <Receipt size={48} className="mx-auto mb-2 opacity-50" />
          <p>No orders placed yet. Cannot generate bill.</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between">
          <div className="p-5 space-y-6 overflow-y-auto max-h-[calc(100vh-220px)]">
            {/* Bill ID and time banner */}
            <div className="bg-emerald-950 text-white rounded-2xl p-4 shadow-sm text-left">
              <p className="text-[10px] uppercase font-bold tracking-wider opacity-75">Bill Status</p>
              <p className="text-lg font-black mt-1">Pending Payment</p>
              <p className="text-[10px] opacity-75 mt-0.5">Please pay at checkout or via server. Table {tableNumber}</p>
            </div>

            {/* Items */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Order Items</h3>
              <div className="space-y-3">
                {allItems.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-sm text-gray-700">
                    <span>{item.name} x {item.qty}</span>
                    <span className="font-semibold text-gray-900">₹{item.price * item.qty}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer receipt */}
          <div className="border-t border-stone-100 p-4 space-y-4 bg-stone-50">
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-stone-500">
                <span>Subtotal</span>
                <span>₹{billSubtotal}</span>
              </div>
              <div className="flex justify-between text-xs text-stone-500">
                <span>Taxes & Charges (10%)</span>
                <span>₹{billTaxes}</span>
              </div>
              <div className="border-t border-stone-200 my-1 pt-1.5 flex justify-between font-black text-gray-900 text-base">
                <span>Grand Total</span>
                <span>₹{billTotal}</span>
              </div>
            </div>

            <div className="text-center py-2 space-y-1">
              <p className="text-sm font-extrabold text-gray-800 flex items-center justify-center gap-1.5">
                Thank you! <Heart size={14} className="text-red-500 fill-red-500" />
              </p>
              <p className="text-[11px] text-stone-400">We hope to serve you again.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
