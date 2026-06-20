'use client';

import React, { useState, useEffect } from 'react';
import { Utensils, ShoppingCart, Search, Plus, Minus, ChevronRight, HelpCircle } from 'lucide-react';
import { MenuItem, CartItem } from '../../types/customer';
import { cn } from '@/lib/utils';
import { useCart } from '@/hooks/useCart';

interface MenuScreenProps {
  tableNumber: string;
  categories: any[];
  menuItems: MenuItem[];
  cart: CartItem[];
  onSelectItem: (item: MenuItem) => void;
  onViewCart: () => void;
  subtotal: number;
  totalCartQuantity: number;
}

export default function MenuScreen({
  tableNumber,
  categories,
  menuItems,
  cart,
  onSelectItem,
  onViewCart,
  subtotal,
  totalCartQuantity
}: MenuScreenProps) {
  const { addToCart, updateQuantity } = useCart();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [vegFilter, setVegFilter] = useState<'all' | 'veg' | 'nonveg'>('all');
  const [restaurantName, setRestaurantName] = useState('Flavors');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('restaurant_name');
      if (stored) {
        setRestaurantName(stored);
      }
    }
  }, []);

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

  const getItemQuantity = (itemId: number) => {
    return cart
      .filter((cartItem) => cartItem.id === itemId)
      .reduce((sum, cartItem) => sum + cartItem.quantity, 0);
  };

  const handleAddClick = (e: React.MouseEvent, item: MenuItem) => {
    e.stopPropagation();
    const hasOptions = (item.customizable_options && item.customizable_options.length > 0) || (item.addons && item.addons.length > 0);
    if (hasOptions) {
      onSelectItem(item);
    } else {
      addToCart(item, 1, null, []);
    }
  };

  const handleIncrement = (e: React.MouseEvent, item: MenuItem) => {
    e.stopPropagation();
    const idx = cart.findIndex((cartItem) => cartItem.id === item.id);
    if (idx > -1) {
      updateQuantity(idx, 1);
    } else {
      addToCart(item, 1, null, []);
    }
  };

  const handleDecrement = (e: React.MouseEvent, item: MenuItem) => {
    e.stopPropagation();
    const idx = [...cart].reverse().findIndex((cartItem) => cartItem.id === item.id);
    if (idx > -1) {
      const actualIndex = cart.length - 1 - idx;
      updateQuantity(actualIndex, -1);
    }
  };

  const filteredMenuItems = menuItems.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.category && item.category.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = !activeCategory ||
      (item.category && item.category.toLowerCase() === activeCategory.toLowerCase());
    const matchesVeg = vegFilter === 'all' ||
      (vegFilter === 'veg' && item.is_veg) ||
      (vegFilter === 'nonveg' && !item.is_veg);
    return matchesSearch && matchesCategory && matchesVeg;
  });

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden min-h-0 w-full">
      {/* Top Header */}
      <div className="bg-white px-4 pt-4 pb-2 border-b border-stone-100 sticky top-0 z-10">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-850 p-1.5 rounded-lg">
              <Utensils className="h-5 w-5 text-emerald-800" />
            </div>
            <div>
              <h1 className="font-extrabold text-lg text-gray-900 leading-none">{restaurantName}</h1>
              <span className="text-[10px] text-gray-400 font-semibold">Restaurant</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-stone-50 border border-stone-200 rounded-full px-4 py-1.5 text-xs font-bold text-gray-700 flex items-center gap-1.5 shadow-sm">
              <span>Table {tableNumber}</span>
            </div>
            <button
              onClick={onViewCart}
              className="relative p-2 bg-stone-50 border border-stone-200 rounded-full text-gray-700 shadow-sm"
            >
              <ShoppingCart size={18} />
              {totalCartQuantity > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-emerald-600 text-white text-[9px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white animate-bounce">
                  {totalCartQuantity}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            placeholder="Search for dishes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-700"
          />
        </div>

        {/* Veg/Non-Veg Filter */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setVegFilter('all')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1",
              vegFilter === 'all'
                ? "bg-stone-800 text-white border-stone-800"
                : "bg-stone-50 text-stone-600 border-stone-200"
            )}
          >
            All
          </button>
          <button
            onClick={() => setVegFilter('veg')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5",
              vegFilter === 'veg'
                ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                : "bg-stone-50 text-stone-600 border-stone-200"
            )}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
            Veg
          </button>
          <button
            onClick={() => setVegFilter('nonveg')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5",
              vegFilter === 'nonveg'
                ? "bg-rose-50 text-rose-800 border-rose-300"
                : "bg-stone-50 text-stone-600 border-stone-200"
            )}
          >
            <span className="w-2 h-2 rounded-full bg-rose-600" />
            Non-Veg
          </button>
        </div>

        {/* Category selector */}
        <div className="flex gap-2 overflow-x-auto py-3 no-scrollbar scroll-smooth">
          <button
            onClick={() => setActiveCategory(null)}
            className={cn(
              "px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap border transition-all",
              !activeCategory
                ? "bg-emerald-800 text-white border-emerald-800 shadow"
                : "bg-white text-stone-600 border-stone-200"
            )}
          >
            All Items
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.name)}
              className={cn(
                "px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap border flex items-center gap-1.5 transition-all",
                activeCategory === cat.name
                  ? "bg-emerald-800 text-white border-emerald-800 shadow"
                  : "bg-white text-stone-600 border-stone-200"
              )}
            >
              <span>{getCategoryEmoji(cat.name)}</span>
              <span>{cat.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Menu List */}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-6">
        {filteredMenuItems.length === 0 ? (
          <div className="text-center py-12 text-stone-400">
            <HelpCircle size={48} className="mx-auto mb-2 opacity-50" />
            <p>No dishes found matching your search.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-800">
              {activeCategory || 'Our Specials'}
            </h2>
            {filteredMenuItems.map((item) => (
              <div
                key={item.id}
                className="bg-white border border-stone-100 rounded-2xl p-3 flex gap-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => onSelectItem(item)}
              >
                {/* Left: Info */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={cn(
                        "w-2.5 h-2.5 rounded-full shrink-0",
                        item.is_veg ? "bg-emerald-600" : "bg-rose-600"
                      )} />
                      <span className="text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-bold">Popular</span>
                    </div>
                    <h3 className="font-extrabold text-gray-800 text-base leading-tight truncate">{item.name}</h3>
                    <p className="text-xs text-stone-400 line-clamp-2 mt-1 leading-snug">
                      Delicious and freshly prepared using original recipe, spices, and premium ingredients.
                    </p>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="font-black text-gray-900 text-lg">₹{item.selling_price}</span>
                    {getItemQuantity(item.id) === 0 ? (
                      <button
                        className="bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-800 rounded-xl px-3 py-1.5 text-xs font-black flex items-center gap-1 shadow-sm transition-all active:scale-[0.97]"
                        onClick={(e) => handleAddClick(e, item)}
                      >
                        <Plus size={14} /> Add
                      </button>
                    ) : (
                      <div className="flex items-center bg-emerald-800 text-white rounded-xl shadow-sm border border-emerald-800 overflow-hidden">
                        <button
                          className="px-2.5 py-1.5 text-xs font-black hover:bg-emerald-900 transition-colors active:scale-95"
                          onClick={(e) => handleDecrement(e, item)}
                        >
                          -
                        </button>
                        <span className="px-2 text-xs font-black min-w-[16px] text-center">
                          {getItemQuantity(item.id)}
                        </span>
                        <button
                          className="px-2.5 py-1.5 text-xs font-black hover:bg-emerald-900 transition-colors active:scale-95"
                          onClick={(e) => handleIncrement(e, item)}
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Picture */}
                <div className="w-24 h-24 bg-stone-100 rounded-xl overflow-hidden shrink-0 flex items-center justify-center text-4xl shadow-inner relative">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <span>{getCategoryEmoji(item.category)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Static view cart bar */}
      {cart.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 bg-emerald-800 text-white p-4 flex items-center justify-between shadow-[0_-4px_10px_rgba(0,0,0,0.15)] z-50">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-900 p-2 rounded-xl">
              <ShoppingCart size={18} />
            </div>
            <div>
              <p className="text-xs opacity-80">{totalCartQuantity} {totalCartQuantity === 1 ? 'item' : 'items'} added</p>
              <p className="font-black text-sm">₹{subtotal}</p>
            </div>
          </div>
          <button
            onClick={onViewCart}
            className="bg-white text-emerald-950 font-black text-sm px-5 py-2.5 rounded-xl flex items-center gap-1 hover:bg-stone-50 active:scale-[0.97] transition-transform"
          >
            View Cart <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
