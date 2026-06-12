'use client';

import React from 'react';
import { RefreshCw, Clock, HelpCircle, ArrowLeft, Bell } from 'lucide-react';
import { Order } from '../../types/customer';
import { cn } from '@/lib/utils';

interface OrderTrackingProps {
  orders: Order[];
  onBack: () => void;
  onRefresh: () => void;
  onViewOrderDetails: (orderId: string) => void;
  onCallWaiter: () => void;
}

export default function OrderTracking({
  orders,
  onBack,
  onRefresh,
  onViewOrderDetails,
  onCallWaiter
}: OrderTrackingProps) {
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
          <h2 className="text-lg font-black text-gray-900">Order Status</h2>
        </div>
        <button 
          onClick={onRefresh}
          className="p-1.5 text-stone-400 hover:text-gray-750"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="flex-1 p-5 space-y-6 overflow-y-auto max-h-[calc(100vh-160px)]">
        {orders.length === 0 ? (
          <div className="text-center py-12 text-stone-400">
            <HelpCircle size={48} className="mx-auto mb-2 opacity-50" />
            <p>No active orders placed in this session yet.</p>
            <button 
              onClick={onBack} 
              className="mt-4 text-emerald-800 font-bold"
            >
              Go Back to Menu
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {orders.map((order) => {
              const statusText = order.status; // sent_to_kitchen, preparing, ready, completed
              
              const isReceived = ['sent_to_kitchen', 'preparing', 'ready', 'completed'].includes(statusText) || order.order_status === 'open';
              const isPreparing = ['preparing', 'ready', 'completed'].includes(statusText);
              const isReady = ['ready', 'completed'].includes(statusText);
              const isServed = ['completed'].includes(statusText) || order.order_status === 'completed';

              return (
                <div key={order.order_id} className="bg-stone-50 border border-stone-200 rounded-2xl p-4 space-y-4">
                  {/* Status banner */}
                  <div className="bg-emerald-950 text-white rounded-xl p-3 flex justify-between items-center shadow-inner">
                    <div>
                      <p className="text-[10px] opacity-75 uppercase font-bold tracking-wider">Order ID</p>
                      <p className="text-xs font-bold truncate tracking-wide">#{order.order_id.slice(0, 8).toUpperCase()}</p>
                    </div>
                    <button
                      onClick={() => onViewOrderDetails(order.order_id)}
                      className="bg-white/20 text-white font-bold text-[10px] px-3 py-1.5 rounded-lg hover:bg-white/30"
                    >
                      Details
                    </button>
                  </div>

                  {/* Vertical Stepper */}
                  <div className="relative pl-6 space-y-6 border-l border-stone-200 ml-3 py-2">
                    {/* Step 1: Received */}
                    <div className="relative">
                      <div className={cn(
                        "absolute -left-[30px] top-0.5 w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center",
                        isReceived ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-stone-300"
                      )}>
                        {isReceived && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                      </div>
                      <div className={cn(isReceived ? "opacity-100" : "opacity-50")}>
                        <h4 className="text-xs font-black text-gray-800">Order Received</h4>
                        <p className="text-[10px] text-stone-500 mt-0.5">Your order has been received by staff</p>
                      </div>
                    </div>

                    {/* Step 2: Preparing */}
                    <div className="relative">
                      <div className={cn(
                        "absolute -left-[30px] top-0.5 w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center",
                        isPreparing ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-stone-300"
                      )}>
                        {isPreparing && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                      </div>
                      <div className={cn(isPreparing ? "opacity-100" : "opacity-50")}>
                        <h4 className="text-xs font-black text-gray-800">Preparing</h4>
                        <p className="text-[10px] text-stone-500 mt-0.5">Our chef is preparing your meal</p>
                      </div>
                    </div>

                    {/* Step 3: Ready */}
                    <div className="relative">
                      <div className={cn(
                        "absolute -left-[30px] top-0.5 w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center",
                        isReady ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-stone-300"
                      )}>
                        {isReady && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                      </div>
                      <div className={cn(isReady ? "opacity-100" : "opacity-50")}>
                        <h4 className="text-xs font-black text-gray-800">Ready to Serve</h4>
                        <p className="text-[10px] text-stone-500 mt-0.5">Your order is ready to be served</p>
                      </div>
                    </div>

                    {/* Step 4: Served */}
                    <div className="relative">
                      <div className={cn(
                        "absolute -left-[30px] top-0.5 w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center",
                        isServed ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-stone-300"
                      )}>
                        {isServed && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                      </div>
                      <div className={cn(isServed ? "opacity-100" : "opacity-50")}>
                        <h4 className="text-xs font-black text-gray-800">Served</h4>
                        <p className="text-[10px] text-stone-500 mt-0.5">Enjoy your delicious food</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Actions */}
      <div className="p-4 border-t border-stone-100 space-y-2 bg-white sticky bottom-0">
        <button
          onClick={onCallWaiter}
          className="w-full border border-stone-200 text-gray-700 py-3.5 rounded-xl font-bold text-xs shadow hover:bg-stone-50 flex items-center justify-center gap-2"
        >
          <Bell size={14} /> Need Help? Call Waiter
        </button>
      </div>
    </div>
  );
}
