'use client';

import React from 'react';
import { LoginForm } from '@/components/auth/login-form';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();

  const handleLoginSuccess = (role: string) => {
    if (role === 'staff') {
      router.push('/admin/pos');
    } else {
      router.push('/admin/dashboard');
    }
  };

  return <LoginForm onSuccess={handleLoginSuccess} />;
}
