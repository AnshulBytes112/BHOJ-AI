'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './sidebar';
import { useAuth } from '@/hooks/use-auth';
import { getWebSocketUrl } from '@/hooks/useWebSocket';
import { CalendarDays, Clock, Bell, ChevronDown, Menu, X } from 'lucide-react';
import { FilterProvider, useFilter } from '@/lib/filter-context';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { MobileDrawer } from '@/components/common/mobile-drawer';
import { cn } from '@/lib/utils';

function DateTimeFilter() {
  const { filterDate, filterTime, setFilterDate, setFilterTime } = useFilter();

  const dateInputRef = React.useRef<HTMLInputElement>(null);
  const timeInputRef = React.useRef<HTMLInputElement>(null);

  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (!mounted || !filterDate) {
    return (
      <>
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <CalendarDays size={14} className="text-gray-400" />
          <span className="w-24 h-4 bg-gray-100 rounded animate-pulse" />
        </div>
        <div className="w-px h-5 bg-gray-200 mx-2" />
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <Clock size={14} className="text-gray-400" />
          <span className="w-16 h-4 bg-gray-100 rounded animate-pulse" />
        </div>
      </>
    );
  }

  // Format for display
  let displayDate = '';
  try {
    displayDate = new Date(filterDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { displayDate = filterDate; }

  let displayTime = filterTime;
  try {
    const [h, m] = filterTime.split(':');
    const d = new Date();
    d.setHours(parseInt(h, 10));
    d.setMinutes(parseInt(m, 10));
    displayTime = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
  } catch { displayTime = filterTime; }

  return (
    <>
      <div
        onClick={() => dateInputRef.current?.showPicker()}
        className="relative flex items-center gap-1.5 text-sm text-gray-500 cursor-pointer hover:text-gray-800 transition-colors"
      >
        <CalendarDays size={14} className="text-gray-400" />
        <span>{displayDate}</span>
        <input
          ref={dateInputRef}
          type="date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        />
      </div>
      <div className="w-px h-5 bg-gray-200 mx-2" />
      <div
        onClick={() => timeInputRef.current?.showPicker()}
        className="relative flex items-center gap-1.5 text-sm text-gray-500 cursor-pointer hover:text-gray-800 transition-colors"
      >
        <Clock size={14} className="text-gray-400" />
        <span>{displayTime}</span>
        <input
          ref={timeInputRef}
          type="time"
          value={filterTime}
          onChange={(e) => setFilterTime(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        />
      </div>
    </>
  );
}

export function DashboardLayout({ children, disablePadding = false }: { children: React.ReactNode; disablePadding?: boolean }) {
  const { user } = useAuth();
  const { isMobile, isTablet } = useBreakpoint();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Notification state
  const [notifications, setNotifications] = useState<any[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const [toastList, setToastList] = useState<{ id: string; text: string; type: 'info' | 'success' | 'warning' }[]>([]);

  const addToast = (text: string, type: 'info' | 'success' | 'warning' = 'info') => {
    const id = Math.random().toString();
    const newToast = { id, text, type };
    setToastList(prev => [newToast, ...prev].slice(0, 3));
    setTimeout(() => {
      setToastList(prev => prev.filter(t => t.id !== id));
    }, 7000);
  };

  // Load notifications from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('pos_notifications');
    if (saved) {
      try {
        setNotifications(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse notifications', e);
      }
    }
  }, []);

  // Save notifications
  const saveNotifications = (list: any[]) => {
    setNotifications(list);
    localStorage.setItem('pos_notifications', JSON.stringify(list));
  };

  // Connect WebSockets
  useEffect(() => {
    function connect() {
      const wsUrl = getWebSocketUrl();
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        console.log('[POS WS] Connected to WS server');
        socket.send(JSON.stringify({ type: 'register', role: 'admin' }));
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          let text = '';
          
          if (message.type === 'CALL_WAITER') {
            text = `🔔 Table ${message.tableNumber} called waiter: "${message.requestType}"`;
          } else if (message.type === 'REQUEST_BILL') {
            text = `💵 Table ${message.tableNumber} requested bill.`;
          } else if (message.type === 'ORDER_PLACED') {
            text = `🍳 New QR Order placed on Table ${message.tableNumber}.`;
          }

          if (text) {
            // Play notification sound
            try {
              const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-200.wav');
              audio.volume = 0.5;
              audio.play().catch(() => {});
            } catch (err) {
              console.warn('Audio play block:', err);
            }

            // Append notification
            const newNotif = {
              id: Math.random().toString(),
              text,
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              unread: true
            };
            
            setNotifications(prev => {
              const updated = [newNotif, ...prev].slice(0, 50); // limit 50
              localStorage.setItem('pos_notifications', JSON.stringify(updated));
              return updated;
            });
          }
        } catch (err) {
          console.error('[POS WS] Message parse failed:', err);
        }
      };

      socket.onclose = () => {
        console.log('[POS WS] Connection closed, retrying in 5s...');
        setTimeout(connect, 5000);
      };

      socket.onerror = (err) => {
        console.error(`[POS WS] Socket error on URL: ${wsUrl}. (Note: browsers hide connection details from WebSocket error events for security)`, err);
        socket.close();
      };
    }

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const unreadCount = notifications.filter(n => n.unread).length;

  const markAllRead = () => {
    const updated = notifications.map(n => ({ ...n, unread: false }));
    saveNotifications(updated);
  };

  const clearAllNotifications = () => {
    saveNotifications([]);
    setBellOpen(false);
  };

  return (
    <FilterProvider>
      <div className="flex min-h-screen bg-muted/30 print:hidden relative">
        {/* Render normal sidebar on Desktop (expanded) and Tablet (collapsed) */}
        {!isMobile && <Sidebar collapsed={isTablet} />}

        {/* Render Mobile Sidebar in a MobileDrawer */}
        {isMobile && (
          <MobileDrawer
            isOpen={mobileSidebarOpen}
            onClose={() => setMobileSidebarOpen(false)}
            title="Navigation Menu"
            size="sm"
          >
            <div className="h-full flex flex-col justify-between -mx-6 -my-5">
              <Sidebar collapsed={false} />
            </div>
          </MobileDrawer>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          {/* ── Top Header Bar ── */}
          <header className="h-14 border-b border-gray-200 bg-white flex items-center justify-between px-6 shrink-0 shadow-sm relative z-20">
            {/* Show Hamburger Button on Mobile */}
            <div className="flex items-center gap-4">
              {isMobile && (
                <button
                  onClick={() => setMobileSidebarOpen(true)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                >
                  <Menu size={20} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-4">
              <DateTimeFilter />

              {/* Notification bell */}
              <div className="w-px h-5 bg-gray-200 mx-1" />
              <div className="relative">
                <button 
                  onClick={() => {
                    setBellOpen(!bellOpen);
                    if (!bellOpen) {
                      markAllRead();
                    }
                  }}
                  className={cn(
                    "relative text-gray-400 hover:text-gray-600 transition-colors p-1.5 rounded-lg hover:bg-gray-50",
                    bellOpen && "bg-gray-100 text-gray-750"
                  )}
                >
                  <Bell size={18} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {/* Notifications Dropdown */}
                {bellOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden py-1 animate-in fade-in-50 slide-in-from-top-2 duration-150">
                    <div className="flex justify-between items-center px-4 py-2 border-b border-gray-100 bg-gray-50/50">
                      <span className="font-extrabold text-xs text-gray-700">Notifications</span>
                      {notifications.length > 0 && (
                        <button 
                          onClick={clearAllNotifications}
                          className="text-[10px] text-red-500 hover:text-red-700 font-bold transition-all"
                        >
                          Clear All
                        </button>
                      )}
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-8 text-center text-xs text-gray-400">
                          No active notifications.
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <div 
                            key={n.id} 
                            className={cn(
                              "px-4 py-3 border-b border-gray-50 last:border-b-0 hover:bg-gray-50 transition-colors text-left",
                              n.unread && "bg-blue-50/20"
                            )}
                          >
                            <p className="text-xs text-gray-800 font-medium leading-normal">{n.text}</p>
                            <span className="text-[9px] text-gray-400 font-bold block mt-1">{n.time}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* User profile */}
              <div className="w-px h-5 bg-gray-200 mx-1" />
              <div className="flex items-center gap-2.5 cursor-pointer hover:bg-gray-50 rounded-lg px-2 py-1 transition-colors">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 border-primary/20">
                  <img
                    src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"
                    alt="User"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="hidden md:block text-right leading-tight">
                  <p className="text-sm font-bold text-gray-800">{user?.name || 'Admin User'}</p>
                  <p className="text-[10px] text-gray-400 capitalize">{user?.role || 'Admin'}</p>
                </div>
                <ChevronDown size={14} className="text-gray-400" />
              </div>
            </div>
          </header>

          {/* ── Main Content ── */}
          <main className={cn(
            "flex-1 flex flex-col min-h-0 min-w-0",
            disablePadding ? "p-0 overflow-hidden" : (isMobile ? "p-4 overflow-y-auto" : "p-8 overflow-y-auto")
          )}>
            {children}
          </main>
        </div>
      </div>
    </FilterProvider>
  );
}

