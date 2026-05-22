import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { RoleGuard } from '@/components/auth/role-guard';
import TableStatusPage from '@/app/(admin)/admin/tables/page';

export default function AdminTableStatusPage() {
  return (
    <RoleGuard allowedRoles={['superadmin', 'admin', 'manager', 'staff']}>
      <DashboardLayout>
        <TableStatusPage />
      </DashboardLayout>
    </RoleGuard>
  );
}
