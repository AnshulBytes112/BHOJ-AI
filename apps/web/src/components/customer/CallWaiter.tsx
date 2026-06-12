'use client';

import React from 'react';
import { Bell } from 'lucide-react';

interface CallWaiterProps {
  tableNumber: string;
  onCall: (type?: string) => void;
}

export default function CallWaiter({ tableNumber, onCall }: CallWaiterProps) {
  return (
    <div className="flex-1 flex flex-col p-6 items-center justify-between bg-white">
      <div className="text-center mt-12 space-y-4">
        <div className="w-28 h-28 bg-emerald-50 rounded-full mx-auto flex items-center justify-center shadow-inner text-5xl">
          🤵
        </div>
        <h2 className="text-2xl font-black text-gray-900">Need Assistance?</h2>
        <p className="text-sm text-stone-500 max-w-[240px] mx-auto text-center">
          Our staff will be there shortly to assist you at Table {tableNumber}.
        </p>
      </div>

      <button
        onClick={() => onCall('General assistance')}
        className="w-full bg-emerald-800 hover:bg-emerald-900 text-white font-bold py-4 rounded-xl shadow-lg flex items-center justify-center gap-2 mt-8 animate-pulse"
      >
        <Bell size={18} /> Call Waiter
      </button>

      {/* Request Type chips */}
      <div className="w-full mt-12">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 text-left">Request Type (Optional)</h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'More Water', emoji: '💧' },
            { label: 'Extra Plates', emoji: '🍽️' },
            { label: 'Tissue', emoji: '🧻' },
            { label: 'Other', emoji: '🙋' }
          ].map((type) => (
            <button
              key={type.label}
              onClick={() => onCall(type.label)}
              className="p-3 border border-stone-200 rounded-xl text-left hover:border-emerald-600 hover:bg-emerald-50/10 transition-colors flex items-center gap-2"
            >
              <span>{type.emoji}</span>
              <span className="text-xs font-bold text-gray-700">{type.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
