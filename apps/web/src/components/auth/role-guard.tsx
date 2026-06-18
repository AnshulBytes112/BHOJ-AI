'use client';

import React from 'react';
import { useAuth, Role } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: Role[];
  redirectTo?: string;
}

/**
 * RoleGuard Component
 * Protects components/pages based on user roles.
 */
export function RoleGuard({ 
  children, 
  allowedRoles, 
  redirectTo = '/login' 
}: RoleGuardProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (!isLoading && !user) {
      console.warn('No session. Redirecting to:', redirectTo);
      router.push(redirectTo);
    }
  }, [user, isLoading, router, redirectTo]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent shadow-lg shadow-primary/20" />
      </div>
    );
  }

  if (!user) {
    return null; // Will be redirected by useEffect
  }

  if (!allowedRoles.includes(user.role)) {
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center bg-gray-50/50 p-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mb-6 shadow-sm border border-red-100">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Restricted</h1>
        <p className="text-gray-500 mb-8 max-w-sm text-sm">
          You do not have the required permissions to view this module. Please contact your administrator if you need access.
        </p>
        <button 
          onClick={() => router.push(user.role === 'staff' ? '/admin/pos' : '/admin/dashboard')} 
          className="px-6 py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl hover:opacity-90 transition-opacity shadow-sm"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
