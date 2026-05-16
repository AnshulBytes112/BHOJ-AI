'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from './sidebar';
import { useAuth } from '@/hooks/use-auth';
import { CalendarDays, Clock, Bell, ChevronDown } from 'lucide-react';
import { FilterProvider, useFilter } from '@/lib/filter-context';

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

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  return (
    <FilterProvider>
      <div className="flex min-h-screen bg-muted/30 print:hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          {/* ── Top Header Bar ── */}
          <header className="h-14 border-b border-gray-200 bg-white flex items-center justify-end px-6 gap-4 shrink-0 shadow-sm">
            <DateTimeFilter />

            {/* Notification bell */}
            <div className="w-px h-5 bg-gray-200 mx-1" />
            <button className="relative text-gray-400 hover:text-gray-600 transition-colors p-1.5 rounded-lg hover:bg-gray-50">
              <Bell size={18} />
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                3
              </span>
            </button>

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
          </header>

          {/* ── Main Content ── */}
          <main className="flex-1 p-8 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </FilterProvider>
  );
}
