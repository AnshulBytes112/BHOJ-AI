import React from 'react';
import { cn } from '@/lib/utils';

interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function PageContainer({ children, className, ...props }: PageContainerProps) {
  return (
    <div
      className={cn(
        "w-full mx-auto px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8 max-w-7xl",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
