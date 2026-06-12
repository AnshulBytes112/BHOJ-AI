'use client';

import React from 'react';

interface RequestBillProps {
  onConfirmRequest: () => void;
  isSubmitting: boolean;
}

export default function RequestBill({ onConfirmRequest, isSubmitting }: RequestBillProps) {
  return (
    <div className="flex-1 flex flex-col p-6 items-center justify-center text-center bg-white justify-between">
      <div className="my-auto space-y-5">
        <div className="w-28 h-28 bg-emerald-50 rounded-full mx-auto flex items-center justify-center shadow-inner relative text-6xl">
          📄
          <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-emerald-850 rounded-full border-4 border-white flex items-center justify-center text-white text-lg font-black">
            ₹
          </div>
        </div>
        
        <h2 className="text-2xl font-black text-gray-900">Request Bill</h2>
        <p className="text-sm text-stone-500 max-w-[260px] mx-auto leading-relaxed">
          Your bill will be generated and our restaurant staff will assist you shortly.
        </p>
      </div>

      <button
        onClick={onConfirmRequest}
        disabled={isSubmitting}
        className="w-full bg-emerald-800 text-white py-4 rounded-xl font-bold text-sm shadow-lg hover:bg-emerald-900 disabled:bg-stone-300 transition-all"
      >
        {isSubmitting ? 'Requesting...' : 'Request Bill'}
      </button>
    </div>
  );
}
