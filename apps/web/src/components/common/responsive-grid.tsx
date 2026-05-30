import React from 'react';
import { cn } from '@/lib/utils';

interface ResponsiveGridProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  columns?: {
    mobile?: number;
    tablet?: number;
    desktop?: number;
  };
}

export function ResponsiveGrid({ children, className, columns, ...props }: ResponsiveGridProps) {
  const mobileCols = columns?.mobile ?? 1;
  const tabletCols = columns?.tablet ?? 2;
  const desktopCols = columns?.desktop ?? 4;

  const colClasses = cn(
    "grid gap-4 sm:gap-6",
    // Mobile first (width < 768px)
    mobileCols === 1 && "grid-cols-1",
    mobileCols === 2 && "grid-cols-2",
    mobileCols === 3 && "grid-cols-3",
    
    // Tablet (md breakpoint: >= 768px)
    tabletCols === 1 && "md:grid-cols-1",
    tabletCols === 2 && "md:grid-cols-2",
    tabletCols === 3 && "md:grid-cols-3",
    tabletCols === 4 && "md:grid-cols-4",
    
    // Desktop (xl breakpoint: >= 1280px)
    desktopCols === 1 && "xl:grid-cols-1",
    desktopCols === 2 && "xl:grid-cols-2",
    desktopCols === 3 && "xl:grid-cols-3",
    desktopCols === 4 && "xl:grid-cols-4",
    desktopCols === 5 && "xl:grid-cols-5",
    desktopCols === 6 && "xl:grid-cols-6"
  );

  return (
    <div className={cn(colClasses, className)} {...props}>
      {children}
    </div>
  );
}
