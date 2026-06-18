'use client';

import React from 'react';
import { RoleGuard } from '@/components/auth/role-guard';
import { AdminDashboardShell } from '@/components/admin/admin-dashboard-shell';

/**
 * Root Layout for the Admin Module.
 * Wraps all sub-routes in a RoleGuard ensuring only 'admin' users can enter.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['admin', 'superadmin', 'manager', 'staff']}>
      {children}
    </RoleGuard>
  );
}
