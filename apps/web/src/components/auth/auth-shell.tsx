'use client';

import React from 'react';
import { HelpCircle, Sun, ChefHat } from 'lucide-react';

interface AuthShellProps {
  children: React.ReactNode;
}

export function AuthShell({ children }: AuthShellProps) {
  return (
    <div className="min-h-screen w-full flex flex-col bg-[#0f0f0f] text-white selection:bg-orange-500/30 relative overflow-hidden">
      {/* Dynamic Background Glow Animation Styles */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes float-glow-1 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.8; }
          33% { transform: translate(40px, -60px) scale(1.15); opacity: 0.9; }
          66% { transform: translate(-20px, 30px) scale(0.9); opacity: 0.7; }
        }
        @keyframes float-glow-2 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.6; }
          50% { transform: translate(-50px, 40px) scale(1.2); opacity: 0.8; }
        }
        .animate-glow-1 {
          animation: float-glow-1 20s infinite ease-in-out;
        }
        .animate-glow-2 {
          animation: float-glow-2 25s infinite ease-in-out;
        }
      `}} />

      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-orange-500/10 blur-[160px] rounded-full pointer-events-none animate-glow-1" />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-orange-500/5 blur-[160px] rounded-full pointer-events-none animate-glow-2" />

      {/* Simple Header */}
      <div className="w-full h-20 px-8 flex items-center justify-between border-b border-white/5 bg-[#0f0f0f]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2 cursor-pointer hover:opacity-90 transition-opacity">
          <div className="w-8 h-8 bg-orange-500 rounded flex items-center justify-center text-white shadow-[0_0_15px_rgba(249,115,22,0.3)]">
            <ChefHat className="w-5 h-5" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">
            BhojAI
          </span>
        </div>
        
        {/* Help / Support Link */}
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <HelpCircle className="w-4 h-4 text-gray-400" />
          <span>Need help?</span>
          <a href="#" className="text-orange-500 hover:text-orange-400 font-medium hover:underline transition-all">
            Contact Support
          </a>
        </div>
      </div>

      {/* Centered Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative z-10">
        <div className="w-full max-w-5xl bg-[#141414]/75 border border-white/5 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden flex justify-center animate-in fade-in zoom-in-95 duration-500 ease-out">
          {children}
        </div>

        {/* Page Footer */}
        <div className="w-full max-w-5xl mt-8 flex justify-between items-center text-xs text-gray-500">
          <p className="flex items-center gap-4">
            <span>© 2025 BhojAI Restaurant OS. All rights reserved.</span>
            <span className="text-gray-700">|</span>
            <span>Built for restaurants. Designed for growth.</span>
          </p>
        </div>
      </div>

      {/* Theme toggle icon at bottom-left */}
      <div className="absolute bottom-6 left-6 z-20">
        <button className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 transition-all text-gray-400 hover:text-white">
          <Sun className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
