'use client';

import { useState, useEffect } from 'react';
import { mockDb } from '@/lib/mock-api';
import apiClient from '@/services/apiClient';

export type Role = 'superadmin' | 'admin' | 'staff' | 'manager' | null;

interface User {
  name: string;
  role: Role;
  restaurantName?: string;
}

/**
 * useAuth Hook
 * Manages the current user session and role.
 * In a real app, this would use Context or Zustand.
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      try {
        const currentUser = await mockDb.getCurrentUser();
        setUser(currentUser as User);
      } catch (error) {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }

    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await apiClient.post('/public/login', { email, password });
      if (response.data?.success) {
        const userObj = response.data.user;
        setUser(userObj);
        if (typeof window !== 'undefined') {
          localStorage.setItem('user', JSON.stringify(userObj));
          localStorage.setItem('token', String(userObj.id));
          localStorage.setItem('restaurant_name', userObj.restaurantName);
        }
        return userObj;
      }
    } catch (e) {
      console.error('Login failed:', e);
    }
    return false;
  };

  const loginWithPin = async (pin: string) => {
    try {
      const response = await apiClient.post('/public/login/pin', { pin });
      if (response.data?.success) {
        const userObj = response.data.user;
        setUser(userObj);
        if (typeof window !== 'undefined') {
          localStorage.setItem('user', JSON.stringify(userObj));
          localStorage.setItem('token', String(userObj.id));
          localStorage.setItem('restaurant_name', userObj.restaurantName);
        }
        return userObj;
      }
    } catch (e) {
      console.error('PIN Login failed:', e);
    }
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  return {
    user,
    isLoading,
    login,
    loginWithPin,
    logout,
    isSuperAdmin: user?.role === 'superadmin',
    isAdmin: user?.role === 'admin',
    isManager: user?.role === 'manager',
    isStaff: user?.role === 'staff',
  };
}
