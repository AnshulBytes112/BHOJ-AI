'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBreakpoint } from '@/hooks/use-breakpoint';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  disablePadding?: boolean;
}

export function MobileDrawer({
  isOpen,
  onClose,
  title,
  children,
  footer,
  className,
  size = 'md',
  disablePadding = false
}: MobileDrawerProps) {
  const { isMobile } = useBreakpoint();

  // Prevent background scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end print:hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Drawer Box */}
      <div
        className={cn(
          "bg-white shadow-2xl z-50 flex flex-col transition-all duration-300 ease-in-out",
          // Mobile: bottom sheet or full-screen
          isMobile
            ? (size === 'full' 
                ? "fixed inset-0 h-full w-full animate-in slide-in-from-bottom" 
                : "fixed inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl animate-in slide-in-from-bottom")
            : "fixed inset-y-0 right-0 h-full border-l animate-in slide-in-from-right",
          
          // Width for tablet/desktop
          !isMobile && {
            'sm': 'w-80',
            'md': 'w-[400px]',
            'lg': 'w-[500px]',
            'xl': 'w-[600px]',
            'full': 'w-full',
          }[size],
          className
        )}
      >
        {/* Drag handle (Mobile bottom sheet only, not on full screen) */}
        {isMobile && size !== 'full' && (
          <div className="w-12 h-1 bg-gray-200 rounded-full mx-auto my-3 shrink-0 cursor-pointer" onClick={onClose} />
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div>
            <h2 className="font-bold text-gray-950 text-base">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className={cn(
          "flex-1 min-h-0 flex flex-col",
          disablePadding ? "p-0 overflow-hidden" : "overflow-y-auto px-6 py-5"
        )}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="p-6 bg-white border-t border-gray-100 space-y-3 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
