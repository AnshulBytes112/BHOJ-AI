'use client';

import React, { useState } from 'react';
import { ArrowLeft, Plus, Minus } from 'lucide-react';
import { MenuItem } from '../../types/customer';
import { cn } from '@/lib/utils';

interface ItemDetailsScreenProps {
  item: MenuItem;
  onBack: () => void;
  onConfirm: (spiceLevel: 'Mild' | 'Medium' | 'Hot', extras: string[], quantity: number) => void;
}

export default function ItemDetailsScreen({ item, onBack, onConfirm }: ItemDetailsScreenProps) {
  const [spiceLevel, setSpiceLevel] = useState<'Mild' | 'Medium' | 'Hot'>('Medium');
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);

  const getCategoryEmoji = (catName: string) => {
    const name = catName.toLowerCase();
    if (name.includes('starter')) return '🍢';
    if (name.includes('soup')) return '🥣';
    if (name.includes('main')) return '🍛';
    if (name.includes('biryani')) return '🍚';
    if (name.includes('beverage') || name.includes('drink')) return '🥤';
    if (name.includes('sweet') || name.includes('dessert')) return '🍨';
    return '🍽️';
  };

  const addons = item.addons || [];

  const getExtraPrice = (extraName: string) => {
    const addon = addons.find(a => a.name === extraName);
    return addon ? Number(addon.price) : 0;
  };

  const currentPrice = item.selling_price + selectedExtras.reduce((sum, extra) => sum + getExtraPrice(extra), 0);

  return (
    <div className="flex-grow flex flex-col bg-white">
      {/* Header image / fallback */}
      <div className="h-56 bg-stone-150 relative flex items-center justify-center text-7xl shadow-inner">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <span>{getCategoryEmoji(item.category)}</span>
        )}
        
        <button 
          onClick={onBack}
          className="absolute top-4 left-4 p-2 bg-black/45 backdrop-blur-md text-white rounded-full"
        >
          <ArrowLeft size={20} />
        </button>
      </div>

      {/* Details Panel */}
      <div className="flex-1 p-5 space-y-6 overflow-y-auto">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-3.5 h-3.5 border border-emerald-600 flex items-center justify-center shrink-0">
              <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full" />
            </span>
            <span className="text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-bold">Popular</span>
          </div>
          <div className="flex justify-between items-start mt-2">
            <h2 className="text-2xl font-black text-gray-900 leading-tight">{item.name}</h2>
            <span className="text-2xl font-black text-gray-900">₹{item.selling_price}</span>
          </div>
          <p className="text-sm text-stone-500 mt-2 leading-relaxed">
            Succulent pieces cooked with Chef's secret spice blends, garnished with onion ring, green chillies, and fresh coriander leaves.
          </p>
        </div>

        {/* Spice level options */}
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-gray-700">Spice Level</h3>
          <div className="grid grid-cols-3 gap-2">
            {(['Mild', 'Medium', 'Hot'] as const).map((level) => (
              <button
                key={level}
                onClick={() => setSpiceLevel(level)}
                className={cn(
                  "py-2 rounded-xl text-xs font-bold border transition-all",
                  spiceLevel === level
                    ? "bg-emerald-800 text-white border-emerald-800"
                    : "bg-white text-stone-600 border-stone-200"
                )}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        {/* Add extras options */}
        {addons.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-gray-700">Add Extra</h3>
            <div className="space-y-2">
              {addons.map((extra) => {
                const isSelected = selectedExtras.includes(extra.name);
                return (
                  <label 
                    key={extra.name}
                    className={cn(
                      "flex items-center justify-between p-3.5 border rounded-xl cursor-pointer transition-all",
                      isSelected ? "border-emerald-600 bg-emerald-50/20" : "border-stone-200"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <input 
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          if (isSelected) {
                            setSelectedExtras(selectedExtras.filter(e => e !== extra.name));
                          } else {
                            setSelectedExtras([...selectedExtras, extra.name]);
                          }
                        }}
                        className="w-4 h-4 text-emerald-850 accent-emerald-800 rounded border-stone-300"
                      />
                      <span className="text-sm font-semibold text-gray-700">{extra.name}</span>
                    </div>
                    <span className="text-xs font-bold text-stone-500">+ ₹{extra.price}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Actions */}
      <div className="p-4 border-t border-stone-100 flex gap-4 bg-white sticky bottom-0">
        {/* Qty selectors */}
        <div className="flex items-center border border-stone-200 rounded-xl px-2">
          <button 
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            className="p-2 text-stone-500 hover:text-stone-850"
          >
            <Minus size={16} />
          </button>
          <span className="w-8 text-center font-bold text-sm text-gray-800">{quantity}</span>
          <button 
            onClick={() => setQuantity(quantity + 1)}
            className="p-2 text-stone-500 hover:text-stone-850"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Add button */}
        <button
          onClick={() => onConfirm(spiceLevel, selectedExtras, quantity)}
          className="flex-grow bg-emerald-800 hover:bg-emerald-900 text-white font-bold py-3.5 rounded-xl shadow flex items-center justify-between px-4 transition-all"
        >
          <span>Add to Cart</span>
          <span className="text-sm">
            ₹{currentPrice * quantity}
          </span>
        </button>
      </div>
    </div>
  );
}
