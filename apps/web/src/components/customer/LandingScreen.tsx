'use client';

import React from 'react';
import { Utensils } from 'lucide-react';

interface LandingScreenProps {
  tableNumber: string;
  onStart: () => void;
}

export default function LandingScreen({ tableNumber, onStart }: LandingScreenProps) {
  return (
    <div className="flex-grow flex flex-col p-6 bg-gradient-to-b from-stone-50 to-white justify-between">
      {/* Header */}
      <div className="text-center mt-8">
        <div className="w-24 h-24 bg-emerald-850 rounded-full mx-auto flex items-center justify-center shadow-lg border-4 border-white mb-4">
          <Utensils className="h-12 w-12 text-emerald-800" />
        </div>
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Flavors</h1>
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800 mt-1">Restaurant</p>
        
        <div className="mt-8">
          <h2 className="text-2xl font-bold text-gray-800">Welcome to Flavors</h2>
          <p className="text-sm text-stone-500 mt-1">Delicious food, your way!</p>
        </div>

        {/* Table No. */}
        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 mt-8 max-w-[200px] mx-auto shadow-sm">
          <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Table No.</p>
          <p className="text-5xl font-black text-emerald-800 mt-1">{tableNumber}</p>
        </div>
      </div>

      {/* Promo banner */}
      <div className="my-8 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
        <div className="bg-amber-100 text-amber-800 text-lg font-black p-3 rounded-xl">10% OFF</div>
        <div>
          <p className="font-bold text-amber-900 text-sm">ON ALL ORDERS</p>
          <p className="text-xs text-amber-700">Scan QR, Order, and Enjoy discount</p>
        </div>
      </div>

      {/* Today's Specials */}
      <div className="mb-8 text-left">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Today's Specials</h3>
        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-3 flex gap-3 items-center">
          <div className="w-16 h-16 bg-stone-200 rounded-xl overflow-hidden shrink-0 flex items-center justify-center text-2xl shadow-inner">
            🍢
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 border border-emerald-600 flex items-center justify-center shrink-0">
                <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full" />
              </span>
              <h4 className="font-bold text-gray-800 text-sm truncate">Paneer Tikka</h4>
            </div>
            <p className="text-xs text-stone-500 truncate mt-0.5">Cottage cheese marinated in spices & grilled.</p>
            <p className="font-black text-gray-900 text-sm mt-1">₹249</p>
          </div>
        </div>
      </div>

      {/* Bottom Button */}
      <button
        onClick={onStart}
        className="w-full bg-emerald-800 text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:bg-emerald-900 active:scale-[0.98] transition-all"
      >
        Start Ordering
      </button>
    </div>
  );
}
