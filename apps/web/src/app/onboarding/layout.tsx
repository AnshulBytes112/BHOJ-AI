import React from 'react';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        {/* Simple Brand Header */}
        <div className="flex justify-center mb-10">
          <div className="flex items-center gap-2">
             <div className="w-8 h-8 bg-orange-500 rounded flex items-center justify-center text-white">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6z" />
                </svg>
             </div>
             <span className="text-xl font-bold tracking-tight text-gray-900">
                BhojAI
             </span>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
