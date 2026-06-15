'use client';

import React, { useState } from 'react';
import { ArrowLeft, Plus, Minus } from 'lucide-react';
import { MenuItem } from '../../types/customer';
import { cn } from '@/lib/utils';

interface ItemDetailsScreenProps {
  item: MenuItem;
  onBack: () => void;
  onConfirm: (spiceLevel: string | null, extras: string[], quantity: number) => void;
}

export default function ItemDetailsScreen({ item, onBack, onConfirm }: ItemDetailsScreenProps) {
  const [spiceLevel, setSpiceLevel] = useState<string | null>(null);
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);

  const handleSpiceSelect = (level: string) => {
    setSpiceLevel(level);
    const spiceGroup = item.customizable_options?.find(
      g => g.name.toLowerCase().includes('spice')
    );
    if (spiceGroup) {
      const spiceChoiceNames = spiceGroup.choices.map(c => c.name);
      setSelectedExtras(prev => {
        const filtered = prev.filter(e => !spiceChoiceNames.includes(e));
        return [...filtered, level];
      });
    }
  };

  // Load default required options on mount
  React.useEffect(() => {
    let initialSpice: string | null = null;
    const defaultExtras: string[] = [];
    if (item.customizable_options) {
      const spiceGroup = item.customizable_options.find(
        g => g.name.toLowerCase().includes('spice')
      );
      if (spiceGroup && spiceGroup.choices && spiceGroup.choices.length > 0) {
        const mediumChoice = spiceGroup.choices.find(c => c.name.toLowerCase() === 'medium');
        initialSpice = mediumChoice ? mediumChoice.name : spiceGroup.choices[0].name;
      }

      item.customizable_options.forEach(group => {
        const isSpice = group.name.toLowerCase().includes('spice');
        if (isSpice) {
          if (initialSpice) {
            defaultExtras.push(initialSpice);
          }
        } else if (group.required && group.choices && group.choices.length > 0) {
          defaultExtras.push(group.choices[0].name);
        }
      });
    }
    setSpiceLevel(initialSpice);
    setSelectedExtras(defaultExtras);
  }, [item]);

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
    if (addon) return Number(addon.price);

    for (const group of item.customizable_options || []) {
      const choice = (group.choices || []).find(c => c.name === extraName);
      if (choice) return Number(choice.price);
    }
    return 0;
  };

  const currentPrice = Number(item.selling_price) + selectedExtras.reduce((sum, extra) => sum + getExtraPrice(extra), 0);

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
      <div className="flex-grow p-5 space-y-6 overflow-y-auto">
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
        {(() => {
          const spiceGroup = item.customizable_options?.find(
            g => g.name.toLowerCase().includes('spice')
          );
          if (!spiceGroup || !spiceGroup.choices || spiceGroup.choices.length === 0) return null;
          return (
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-700">{spiceGroup.name}</h3>
              <div className="grid grid-cols-3 gap-2">
                {spiceGroup.choices.map((choice) => (
                  <button
                    key={choice.name}
                    type="button"
                    onClick={() => handleSpiceSelect(choice.name)}
                    className={cn(
                      "py-2 rounded-xl text-xs font-bold border transition-all",
                      spiceLevel === choice.name
                        ? "bg-emerald-800 text-white border-emerald-800"
                        : "bg-white text-stone-600 border-stone-200"
                    )}
                  >
                    {choice.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

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

        {/* Dynamic Customizable Options */}
        {item.customizable_options && item.customizable_options
          .filter(group => !group.name.toLowerCase().includes('spice'))
          .map((group) => {
          if (!group.choices || group.choices.length === 0) return null;
          return (
            <div key={group.name} className="space-y-3">
              <h3 className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
                {group.name}
                {group.required && <span className="text-xs text-red-500 font-normal">(Required)</span>}
              </h3>
              <div className="space-y-2">
                {group.choices.map((choice) => {
                  const isSelected = selectedExtras.includes(choice.name);
                  return (
                    <label
                      key={choice.name}
                      className={cn(
                        "flex items-center justify-between p-3.5 border rounded-xl cursor-pointer transition-all",
                        isSelected ? "border-emerald-600 bg-emerald-50/20" : "border-stone-200"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type={group.type === 'single' ? 'radio' : 'checkbox'}
                          name={`customer-group-${group.name}`}
                          checked={isSelected}
                          onChange={() => {
                            if (group.type === 'single') {
                              const groupChoices = group.choices.map(c => c.name);
                              const filtered = selectedExtras.filter(e => !groupChoices.includes(e));
                              setSelectedExtras([...filtered, choice.name]);
                            } else {
                              if (isSelected) {
                                setSelectedExtras(selectedExtras.filter(e => e !== choice.name));
                              } else {
                                setSelectedExtras([...selectedExtras, choice.name]);
                              }
                            }
                          }}
                          className={cn(
                            "w-4 h-4 text-emerald-850 accent-emerald-800 border-stone-300",
                            group.type === 'single' ? 'rounded-full' : 'rounded'
                          )}
                        />
                        <span className="text-sm font-semibold text-gray-700">{choice.name}</span>
                      </div>
                      {Number(choice.price) > 0 && (
                        <span className="text-xs font-bold text-stone-500">+ ₹{choice.price}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
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
