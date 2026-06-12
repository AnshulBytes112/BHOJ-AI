'use client';

import React from 'react';
import { CheckCircle2, Utensils, Clock } from 'lucide-react';

interface OrderConfirmationProps {
  orderId: string | null;
  onTrack: () => void;
}

export default function OrderConfirmation({ orderId, onTrack }: OrderConfirmationProps) {
  return (
    <div className="flex-1 flex flex-col p-6 items-center justify-center text-center bg-white">
      <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
        <CheckCircle2 className="h-10 w-10 text-emerald-600" />
      </div>
      
      <h2 className="text-2xl font-black text-gray-900">Order Placed!</h2>
      <p className="text-sm text-stone-500 mt-2 max-w-[280px]">
        Your order has been placed successfully.
      </p>

      {/* Order ID display box */}
      <div className="my-8 bg-stone-50 border border-stone-200 rounded-2xl p-5 max-w-[240px] w-full shadow-sm">
        <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Order ID</p>
        <p className="text-lg font-black text-gray-800 mt-1 truncate">
          #{orderId?.slice(0, 8).toUpperCase() || 'ORD1256'}
        </p>
      </div>

      <div className="space-y-4 w-full">
        <div className="flex gap-2 items-center bg-emerald-50/25 border border-emerald-100 rounded-xl p-3.5 text-left text-xs text-emerald-800 leading-snug">
          <Utensils size={18} className="shrink-0" />
          <p>We have received your order. Our kitchen team will notify you once it's confirmed.</p>
        </div>

        <div className="flex gap-2 items-center bg-stone-50 border border-stone-150 rounded-xl p-3.5 text-left text-xs text-stone-500 leading-snug">
          <Clock size={18} className="shrink-0" />
          <p>Track your order status and items in real-time right here.</p>
        </div>

        <button
          onClick={onTrack}
          className="w-full bg-emerald-800 text-white py-4 rounded-xl font-bold text-sm shadow hover:bg-emerald-900 active:scale-[0.98] transition-all"
        >
          View Order Status
        </button>
      </div>
    </div>
  );
}
