import React from 'react';
import { cn } from '@/lib/utils';
import { useBreakpoint } from '@/hooks/use-breakpoint';

interface ResponsiveFormProps extends React.FormHTMLAttributes<HTMLFormElement> {
  children: React.ReactNode;
  actions: React.ReactNode;
  className?: string;
  actionsClassName?: string;
}

export function ResponsiveForm({
  children,
  actions,
  className,
  actionsClassName,
  ...formProps
}: ResponsiveFormProps) {
  const { isMobile } = useBreakpoint();

  return (
    <form
      className={cn(
        "flex flex-col relative h-full",
        className
      )}
      {...formProps}
    >
      {/* Form Content - Single column on mobile by default using flex-col */}
      <div className={cn(
        "flex-1",
        isMobile ? "flex flex-col space-y-4 pb-24" : "space-y-6"
      )}>
        {children}
      </div>

      {/* Sticky Actions at bottom for mobile, normal flow for desktop */}
      <div className={cn(
        isMobile
          ? "fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-40"
          : "pt-6 border-t mt-6 flex justify-end gap-3",
        actionsClassName
      )}>
        {/* On mobile, we might want buttons to be full width */}
        <div className={cn(
          isMobile ? "flex flex-col-reverse gap-3 w-full *:w-full" : "flex gap-3 items-center"
        )}>
          {actions}
        </div>
      </div>
    </form>
  );
}
