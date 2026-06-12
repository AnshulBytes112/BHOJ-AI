'use client';

import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { CartItem } from '../../types/customer';
import { cn } from '@/lib/utils';

interface CheckoutScreenProps {
  cart: CartItem[];
  subtotal: number;
  discountAmount: number;
  promoApplied: boolean;
  tableNumber: string;
  onBack: () => void;
  onPlaceOrder: (specialInstructions: string) => void;
  isSubmitting: boolean;
}

export default function CheckoutScreen({
  cart,
  subtotal,
  discountAmount,
  promoApplied,
  tableNumber,
  onBack,
  onPlaceOrder,
  isSubmitting
}: CheckoutScreenProps) {
  const [orderType, setOrderType] = useState<'Dine In' | 'Take Away'>('Dine In');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [paymentOption, setPaymentOption] = useState<'Pay at Restaurant' | 'Online Payment'>('Pay at Restaurant');

  const getExtraPrice = (extra: string) => {
    if (extra.includes('Cheese')) return 40;
    if (extra.includes('Paneer')) return 60;
    return 0;
  };

  const cartItemSubtotal = (item: CartItem) => {
    let itemPrice = item.selling_price;
    if (item.extras) {
      item.extras.forEach(extra => {
        itemPrice += getExtraPrice(extra);
      });
    }
    return itemPrice * item.quantity;
  };

  const taxesAndCharges = (subtotal - discountAmount) * 0.10;
  const total = subtotal - discountAmount + taxesAndCharges;

  return (
    <div className="flex-grow flex flex-col bg-white">
      {/* Header */}
      <div className="px-4 py-4 border-b border-stone-100 flex items-center gap-3 bg-white sticky top-0 z-10">
        <button 
          onClick={onBack}
          className="p-1.5 hover:bg-stone-50 rounded-lg text-gray-700"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-lg font-black text-gray-900">Checkout</h2>
      </div>

      <div className="flex-1 p-5 space-y-6 overflow-y-auto max-h-[calc(100vh-160px)]">
        {/* Order Summary */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Order Summary</h3>
          <div className="bg-stone-50 border border-stone-150 rounded-2xl p-4 space-y-2.5">
            {cart.map((item, idx) => (
              <div key={idx} className="flex justify-between text-xs text-gray-700">
                <span>{item.name} x {item.quantity}</span>
                <span className="font-semibold">₹{cartItemSubtotal(item)}</span>
              </div>
            ))}
            <div className="border-t border-stone-200 pt-2 flex justify-between font-black text-gray-900 text-sm">
              <span>Total Amount</span>
              <span>₹{total}</span>
            </div>
          </div>
        </div>

        {/* Order Type */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Order Type</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className={cn(
              "flex flex-col items-center justify-center p-4 border rounded-2xl cursor-pointer transition-all",
              orderType === 'Dine In' ? "border-emerald-600 bg-emerald-50/10 font-bold" : "border-stone-250 text-stone-500"
            )}>
              <input 
                type="radio" 
                name="orderType" 
                checked={orderType === 'Dine In'}
                onChange={() => setOrderType('Dine In')}
                className="sr-only"
              />
              <span className="text-sm">Dine In</span>
              <span className="text-[10px] opacity-75 mt-0.5">Table No. {tableNumber}</span>
            </label>
            <label className={cn(
              "flex flex-col items-center justify-center p-4 border rounded-2xl cursor-pointer transition-all",
              orderType === 'Take Away' ? "border-emerald-600 bg-emerald-50/10 font-bold" : "border-stone-250 text-stone-500"
            )}>
              <input 
                type="radio" 
                name="orderType" 
                checked={orderType === 'Take Away'}
                onChange={() => setOrderType('Take Away')}
                className="sr-only"
              />
              <span className="text-sm">Take Away</span>
              <span className="text-[10px] opacity-75 mt-0.5">Pack & Go</span>
            </label>
          </div>
        </div>

        {/* Special Instructions */}
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-gray-700">Special Instructions</h3>
          <textarea
            placeholder="Any special requests? (e.g. No onions, extra spicy, etc.)"
            value={specialInstructions}
            onChange={(e) => setSpecialInstructions(e.target.value)}
            className="w-full bg-stone-50 border border-stone-200 rounded-xl p-3 text-xs h-20 focus:outline-none focus:ring-1 focus:ring-emerald-700"
          />
        </div>

        {/* Payment Option */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Payment Option</h3>
          <div className="space-y-2">
            <label className={cn(
              "flex items-center justify-between p-4 border rounded-2xl cursor-pointer transition-all",
              paymentOption === 'Pay at Restaurant' ? "border-emerald-600 bg-emerald-50/10 font-bold" : "border-stone-250 text-stone-500"
            )}>
              <div className="flex items-center gap-2">
                <input 
                  type="radio" 
                  name="paymentOption"
                  checked={paymentOption === 'Pay at Restaurant'}
                  onChange={() => setPaymentOption('Pay at Restaurant')}
                  className="text-emerald-855 accent-emerald-800"
                />
                <span className="text-sm">Pay at Restaurant</span>
              </div>
              <span className="text-[10px] text-stone-400">Cash, Cards, etc.</span>
            </label>
            <label className={cn(
              "flex items-center justify-between p-4 border rounded-2xl cursor-pointer transition-all",
              paymentOption === 'Online Payment' ? "border-emerald-600 bg-emerald-50/10 font-bold" : "border-stone-250 text-stone-500"
            )}>
              <div className="flex items-center gap-2">
                <input 
                  type="radio" 
                  name="paymentOption"
                  checked={paymentOption === 'Online Payment'}
                  onChange={() => setPaymentOption('Online Payment')}
                  className="text-emerald-855 accent-emerald-800"
                />
                <span className="text-sm">Online Payment</span>
              </div>
              <span className="text-[10px] text-stone-400">UPI, Wallets, netbanking</span>
            </label>
          </div>
        </div>
      </div>

      {/* Bottom Place Order */}
      <div className="border-t border-stone-100 p-4 bg-white sticky bottom-0">
        <button
          onClick={() => onPlaceOrder(specialInstructions)}
          disabled={isSubmitting}
          className="w-full bg-emerald-800 hover:bg-emerald-900 text-white font-bold py-3.5 rounded-xl shadow flex items-center justify-between px-4 transition-all disabled:bg-stone-300"
        >
          <span>{isSubmitting ? 'Placing Order...' : 'Place Order'}</span>
          <span className="text-sm">₹{total}</span>
        </button>
      </div>
    </div>
  );
}
