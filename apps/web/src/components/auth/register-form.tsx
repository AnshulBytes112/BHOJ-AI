'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { UI_CONTENT } from '@/lib/content';
import { mockDb } from '@/lib/mock-api';
import apiClient from '@/services/apiClient';

interface RegisterFormProps {
  className?: string;
  onSuccess?: () => void;
}

export function RegisterForm({ className, onSuccess }: RegisterFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    businessName: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { register } = UI_CONTENT.auth;

  async function onSubmit(event: React.SyntheticEvent) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.post('/public/register', formData);
      if (response.data?.success) {
        localStorage.setItem('pending_user', JSON.stringify(response.data.user));
        if (onSuccess) onSuccess();
      } else {
        setError('Registration failed. Please try again.');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className={cn('grid gap-6', className)}>
      <form onSubmit={onSubmit}>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">{register.nameLabel}</Label>
            <Input
              id="name"
              placeholder={register.namePlaceholder}
              disabled={isLoading}
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phone">{register.phoneLabel}</Label>
            <Input
              id="phone"
              placeholder={register.phonePlaceholder}
              type="tel"
              disabled={isLoading}
              required
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="business">{register.businessLabel}</Label>
            <Input
              id="business"
              placeholder={register.businessPlaceholder}
              disabled={isLoading}
              value={formData.businessName}
              onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
            />
          </div>
          {error && (
            <p className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          <Button disabled={isLoading} className="mt-2 bg-primary text-primary-foreground hover:bg-primary/90">
            {isLoading && (
              <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
            )}
            {register.submitButton}
          </Button>
        </div>
      </form>
    </div>
  );
}
