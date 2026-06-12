'use client';

import React from 'react';

interface EmptyCartProps {
  onBrowse: () => void;
}

export default function EmptyCart({ onBrowse }: EmptyCartProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-white">
      <div className="w-24 h-24 bg-stone-50 border border-stone-150 rounded-full flex items-center justify-center text-4xl mb-4 shadow-inner">
        🛒
      </div>
      <h3 className="text-lg font-extrabold text-gray-800">Your cart is empty</h3>
      <p className="text-sm text-stone-500 mt-1 max-w-[240px]">Looks like you haven't added anything yet.</p>
      <button
        onClick={onBrowse}
        className="mt-6 bg-emerald-800 text-white px-8 py-3.5 rounded-xl font-bold text-sm shadow hover:bg-emerald-900 active:scale-[0.98] transition-all"
      >
        Browse Menu
      </button>
    </div>
  );
}
