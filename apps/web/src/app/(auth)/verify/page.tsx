'use client';

import React from 'react';
import { VerifyForm } from '@/components/auth/verify-form';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

export default function VerifyPage() {
  const router = useRouter();
  const { login } = useAuth();

  const handleVerifySuccess = () => {
    if (typeof window !== 'undefined') {
      const pending = localStorage.getItem('pending_user');
      if (pending) {
        const userObj = JSON.parse(pending);
        localStorage.setItem('user', JSON.stringify(userObj));
        localStorage.setItem('token', String(userObj.id));
        localStorage.setItem('restaurant_name', userObj.restaurantName);
        localStorage.removeItem('pending_user');
        window.location.href = '/admin/dashboard';
        return;
      }
    }
    login('admin@restrobit.com', 'admin123');
    router.push('/admin/dashboard');
  };

  return <VerifyForm onSuccess={handleVerifySuccess} />;
}
