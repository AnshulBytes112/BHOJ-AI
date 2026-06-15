'use client';

import React, { useState } from 'react';
import { ArrowLeft, X, Minus, Plus } from 'lucide-react';
import { CartItem } from '../../types/customer';

interface CartScreenProps {
  cart: CartItem[];
  subtotal: number;
  totalCartQuantity: number;
  onBack: () => void;
  onUpdateQuantity: (index: number, change: number) => void;
  onClearCart: () => void;
  onProceed: (discount: number, promoApplied: boolean) => void;
}

export default function CartScreen({
  cart,
  subtotal,
  totalCartQuantity,
  onBack,
  onUpdateQuantity,
  onClearCart,
  onProceed
}: CartScreenProps) {
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);

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

  const getExtraPrice = (item: CartItem, extraName: string) => {
    const addon = item.addons?.find(a => a.name === extraName);
    if (addon) return Number(addon.price);

    for (const group of item.customizable_options || []) {
      const choice = (group.choices || []).find(c => c.name === extraName);
      if (choice) return Number(choice.price);
    }
    return 0;
  };

  const cartItemSubtotal = (item: CartItem) => {
    let itemPrice = Number(item.selling_price);
    if (item.extras) {
      item.extras.forEach(extra => {
        itemPrice += getExtraPrice(item, extra);
      });
    }
    return itemPrice * item.quantity;
  };

  const discountAmount = promoApplied ? subtotal * 0.10 : 0;
  const calculateTaxes = () => {
    return cart.reduce((sum, item) => {
      let itemPrice = Number(item.selling_price);
      if (item.extras) {
        item.extras.forEach(extra => {
          itemPrice += getExtraPrice(item, extra);
        });
      }
      const rate = item.gst_rate ?? 5;
      const itemSubtotal = itemPrice * item.quantity;
      const netItemSubtotal = promoApplied ? itemSubtotal * 0.90 : itemSubtotal;
      return sum + (netItemSubtotal * (rate / 100));
    }, 0);
  };
  const taxesAndCharges = calculateTaxes();
  const total = subtotal - discountAmount + taxesAndCharges;

  return (
    <div className="flex-grow flex flex-col bg-white">
      {/* Header */}
      <div className="px-4 py-4 border-b border-stone-100 flex items-center justify-between bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            className="p-1.5 hover:bg-stone-50 rounded-lg text-gray-700"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-lg font-black text-gray-900">Your Cart ({totalCartQuantity} items)</h2>
        </div>
        <button 
          onClick={onClearCart}
          className="p-1.5 text-stone-400 hover:text-red-500 rounded-lg"
          title="Clear Cart"
        >
          <X size={18} />
        </button>
      </div>

      {/* Cart Items List */}
      {cart.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-24 h-24 bg-stone-50 border border-stone-150 rounded-full flex items-center justify-center text-4xl mb-4 shadow-inner">
            🛒
          </div>
          <h3 className="text-lg font-extrabold text-gray-800">Your cart is empty</h3>
          <p className="text-sm text-stone-500 mt-1 max-w-[240px]">Looks like you haven't added anything yet.</p>
          <button
            onClick={onBack}
            className="mt-6 bg-emerald-800 text-white px-8 py-3.5 rounded-xl font-bold text-sm shadow hover:bg-emerald-900 active:scale-[0.98] transition-all"
          >
            Browse Menu
          </button>
        </div>
      ) : (
        <div className="flex-grow flex flex-col justify-between">
          <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(100vh-280px)]">
            {cart.map((item, index) => (
              <div key={index} className="flex gap-3 border-b border-stone-50 pb-4 last:border-b-0">
                {/* Image */}
                <div className="w-16 h-16 bg-stone-100 rounded-xl overflow-hidden shrink-0 flex items-center justify-center text-2xl shadow-inner">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <span>{getCategoryEmoji(item.category)}</span>
                  )}
                </div>
                
                {/* Name & custom tags */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 border border-emerald-600 flex items-center justify-center shrink-0">
                      <span className="w-1.2 h-1.2 bg-emerald-600 rounded-full" />
                    </span>
                    <h4 className="font-extrabold text-sm text-gray-800 truncate">{item.name}</h4>
                  </div>
                  <p className="text-[10px] text-stone-400 mt-0.5">
                    {item.spiceLevel && `Spice: ${item.spiceLevel}`}
                    {item.extras && item.extras.length > 0 && ` | ${item.extras.join(', ')}`}
                  </p>
                  <p className="font-black text-xs text-gray-800 mt-1">₹{cartItemSubtotal(item)}</p>
                </div>

                {/* Qty Selector */}
                <div className="flex items-center border border-stone-200 rounded-xl px-1.5 h-9 my-auto">
                  <button 
                    onClick={() => onUpdateQuantity(index, -1)}
                    className="p-1 text-stone-500"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="w-6 text-center font-bold text-xs text-gray-800">{item.quantity}</span>
                  <button 
                    onClick={() => onUpdateQuantity(index, 1)}
                    className="p-1 text-stone-500"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>
            ))}

            {/* Promo Section */}
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 flex gap-2 items-center mt-6">
              <input 
                type="text"
                placeholder="Have a promo code?"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                disabled={promoApplied}
                className="flex-1 bg-white border border-stone-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none"
              />
              <button 
                onClick={() => {
                  if (promoCode.trim().toUpperCase() === 'FLAVORS10') {
                    setPromoApplied(true);
                    alert('Promo Applied! 10% Discount added.');
                  } else {
                    alert('Invalid promo code. Try "FLAVORS10".');
                  }
                }}
                disabled={promoApplied || !promoCode}
                className="bg-emerald-800 text-white font-bold text-xs px-4 py-2 rounded-lg hover:bg-emerald-950 disabled:bg-stone-300"
              >
                {promoApplied ? 'Applied' : 'Apply'}
              </button>
            </div>
          </div>

          {/* Subtotal bill details */}
          <div className="border-t border-stone-100 p-4 space-y-4 bg-stone-50">
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-stone-500">
                <span>Subtotal</span>
                <span>₹{subtotal}</span>
              </div>
              {promoApplied && (
                <div className="flex justify-between text-xs text-emerald-600 font-semibold">
                  <span>Promo Discount (10%)</span>
                  <span>- ₹{discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs text-stone-500">
                <span>Taxes & Charges (GST)</span>
                <span>₹{taxesAndCharges.toFixed(2)}</span>
              </div>
              <div className="border-t border-stone-200 my-1 pt-1.5 flex justify-between font-black text-gray-900 text-base">
                <span>Total Amount</span>
                <span>₹{total.toFixed(2)}</span>
              </div>
            </div>

            <button
              onClick={() => onProceed(discountAmount, promoApplied)}
              className="w-full bg-emerald-800 text-white py-3.5 rounded-xl font-bold text-sm shadow hover:bg-emerald-900 active:scale-[0.98] transition-all"
            >
              Proceed to Checkout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
