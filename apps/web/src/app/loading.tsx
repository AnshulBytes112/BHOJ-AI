import React from 'react';
import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="flex h-screen w-screen items-center justify-center p-8 bg-background/50 backdrop-blur-sm z-[9999] fixed inset-0">
      <div className="flex flex-col items-center space-y-4">
        <div className="relative">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <div className="absolute inset-0 h-12 w-12 animate-ping rounded-full border-2 border-primary opacity-20"></div>
        </div>
        <p className="text-primary font-bold animate-pulse text-lg tracking-wide">Loading...</p>
      </div>
    </div>
  );
}
