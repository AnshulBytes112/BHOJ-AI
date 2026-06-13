'use client';

import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { MenuItem, CartItem } from '../types/customer';

interface CartContextProps {
  cart: CartItem[];
  addToCart: (item: MenuItem, quantity: number, spiceLevel?: 'Mild' | 'Medium' | 'Hot', extras?: string[]) => void;
  updateQuantity: (index: number, change: number) => void;
  clearCart: () => void;
  subtotal: number;
  totalCartQuantity: number;
}

export const CartContext = createContext<CartContextProps | undefined>(undefined);

export function CartProvider({ children, tableId }: { children: ReactNode; tableId: string }) {
  const [cart, setCart] = useState<CartItem[]>([]);

  // Load from localstorage on mount/tableId change
  useEffect(() => {
    if (!tableId) return;
    const saved = localStorage.getItem(`cart_${tableId}`);
    if (saved) {
      try {
        setCart(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse cart', e);
      }
    } else {
      setCart([]);
    }
  }, [tableId]);

  // Helper to save cart
  const saveCart = (newCart: CartItem[]) => {
    setCart(newCart);
    if (tableId) {
      localStorage.setItem(`cart_${tableId}`, JSON.stringify(newCart));
    }
  };

  const addToCart = (
    item: MenuItem, 
    quantity: number, 
    spiceLevel: 'Mild' | 'Medium' | 'Hot' = 'Medium', 
    extras: string[] = []
  ) => {
    const sortedExtras = [...extras].sort();
    const existingIndex = cart.findIndex(
      i => i.id === item.id && 
      i.spiceLevel === spiceLevel && 
      JSON.stringify(i.extras) === JSON.stringify(sortedExtras)
    );

    let newCart = [...cart];
    
    if (existingIndex > -1) {
      newCart[existingIndex].quantity += quantity;
    } else {
      newCart.push({
        ...item,
        quantity,
        spiceLevel,
        extras: sortedExtras,
      });
    }

    saveCart(newCart);
  };

  const updateQuantity = (index: number, change: number) => {
    let newCart = [...cart];
    newCart[index].quantity += change;
    
    if (newCart[index].quantity <= 0) {
      newCart.splice(index, 1);
    }
    
    saveCart(newCart);
  };

  const clearCart = () => {
    saveCart([]);
  };

  // Calculations
  const cartItemSubtotal = (item: CartItem) => {
    let itemPrice = Number(item.selling_price);
    if (item.extras) {
      item.extras.forEach(extraName => {
        const addon = item.addons?.find(a => a.name === extraName);
        if (addon) {
          itemPrice += Number(addon.price);
        }
      });
    }
    return itemPrice * item.quantity;
  };

  const subtotal = cart.reduce((sum, item) => sum + cartItemSubtotal(item), 0);
  const totalCartQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider value={{
      cart,
      addToCart,
      updateQuantity,
      clearCart,
      subtotal,
      totalCartQuantity
    }}>
      {children}
    </CartContext.Provider>
  );
}
