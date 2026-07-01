'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { MobileDrawer } from './mobile-drawer';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ResponsiveDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function ResponsiveDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className
}: ResponsiveDialogProps) {
  const { isMobile } = useBreakpoint();

  if (isMobile) {
    return (
      <MobileDrawer
        isOpen={isOpen}
        onClose={() => onOpenChange(false)}
        title={title}
        size="full"
      >
        <div className="flex flex-col h-full">
          {description && (
            <p className="text-sm text-muted-foreground mb-4">{description}</p>
          )}
          <ScrollArea className="flex-1 -mx-6 px-6">
            {children}
          </ScrollArea>
          {footer && (
            <div className="mt-6 pt-4 border-t">
              {footer}
            </div>
          )}
        </div>
      </MobileDrawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className={className}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
