'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { UI_CONTENT } from '@/lib/content';
import { useAuth } from '@/hooks/use-auth';

interface LoginFormProps {
  className?: string;
  onSuccess?: (role: string) => void;
}

export function LoginForm({ className, onSuccess }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<'password' | 'pin'>('password');

  const { login: loginContent } = UI_CONTENT.auth;
  const { login: loginAction, loginWithPin } = useAuth();

  async function onSubmit(event: React.SyntheticEvent) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const user = await loginAction(email, password);
      if (user) {
        if (onSuccess) onSuccess(user.role);
      } else {
        setError('Invalid credentials. Please try again.');
      }
    } catch (err) {
      setError('Invalid credentials. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  const onSubmitPin = React.useCallback(async () => {
    if (pin.length < 4) {
      setError('PIN must be 4 digits.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const user = await loginWithPin(pin);
      if (user) {
        if (onSuccess) onSuccess(user.role);
      } else {
        setError('Invalid PIN. Please try again.');
        setPin(''); // Reset PIN on failure
      }
    } catch (err) {
      setError('Invalid PIN. Please try again.');
      setPin('');
    } finally {
      setIsLoading(false);
    }
  }, [pin, loginWithPin, onSuccess]);
  React.useEffect(() => {
    if (activeTab !== 'pin' || isLoading) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        setPin((p) => (p.length < 4 ? p + e.key : p));
      } else if (e.key === 'Backspace') {
        setPin((p) => p.slice(0, -1));
      } else if (e.key === 'Enter') {
        if (pin.length === 4) {
          onSubmitPin();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, isLoading, pin, onSubmitPin]);

  return (
    <div className={cn('flex flex-col h-full p-8 gap-6', className)}>

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 11l19-9-9 19-2-8-8-2z" />
          </svg>
        </div>
        <div>
          <p className="font-bold text-base text-gray-900 leading-none">BhojAI</p>
          <p className="text-xs text-gray-400 mt-0.5">Restaurant OS · Spice Garden</p>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex rounded-xl p-1 gap-1" style={{ background: '#ede9e0' }}>
        <button
          type="button"
          onClick={() => { setActiveTab('password'); setError(null); }}
          className={cn(
            'flex-1 py-2 text-sm font-semibold rounded-lg transition-all',
            activeTab === 'password'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          Password Login
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab('pin'); setError(null); }}
          className={cn(
            'flex-1 py-2 text-sm font-semibold rounded-lg transition-all',
            activeTab === 'pin'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          Quick PIN
        </button>
      </div>

      {/* ── PASSWORD LOGIN TAB ── */}
      {activeTab === 'password' && (
        <form onSubmit={onSubmit} className="flex flex-col gap-4 flex-1">

          {/* Username */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-bold tracking-widest uppercase text-gray-500">
              Username
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
              </span>
              <input
                id="email"
                type="email"
                placeholder="Enter your username"
                autoComplete="email"
                disabled={isLoading}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={cn(
                  'w-full h-11 rounded-xl border pl-9 pr-4 text-sm text-gray-800 bg-white outline-none transition-all',
                  'border-gray-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 placeholder:text-gray-400',
                  error && 'border-red-400'
                )}
              />
            </div>
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-bold tracking-widest uppercase text-gray-500">
              Password
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                autoComplete="current-password"
                disabled={isLoading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={cn(
                  'w-full h-11 rounded-xl border pl-9 pr-10 text-sm text-gray-800 bg-white outline-none transition-all',
                  'border-gray-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 placeholder:text-gray-400',
                  error && 'border-red-400'
                )}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showPassword ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>



          {/* PIN optional */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pin" className="text-xs font-bold tracking-widest uppercase text-gray-500">
              PIN <span className="normal-case font-normal">(Optional / Waiter 2FA)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
              </span>
              <input
                id="pin"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="e.g. 1234"
                disabled={isLoading}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                className="w-full h-11 rounded-xl border border-gray-200 pl-9 pr-4 text-sm text-gray-800 bg-white outline-none transition-all focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" />
              </svg>
              <p className="text-sm font-medium text-red-600">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="mt-auto w-full h-11 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)', boxShadow: '0 4px 20px rgba(245,158,11,0.35)' }}
          >
            {isLoading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Signing in…
              </>
            ) : 'Sign In to BhojAI'}
          </button>
        </form>
      )}

      {/* ── QUICK PIN TAB ── */}
      {activeTab === 'pin' && (
        <div className="flex flex-col gap-5 flex-1">

          {/* PIN display */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold tracking-widest uppercase text-gray-500">
              Enter your PIN
            </label>
            <div className="flex gap-3 justify-center mt-1">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-12 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all"
                  style={{
                    borderColor: i < pin.length ? '#f59e0b' : '#e5e7eb',
                    background: i < pin.length ? '#fffbf0' : '#fff',
                    color: '#1a0a00',
                  }}
                >
                  {i < pin.length ? '•' : ''}
                </div>
              ))}
            </div>
          </div>

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-2.5 mt-1">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((key) => (
              <button
                key={key}
                type="button"
                disabled={key === ''}
                onClick={() => {
                  if (key === '⌫') {
                    setPin((p) => p.slice(0, -1));
                  } else if (pin.length < 4 && key !== '') {
                    setPin((p) => p + key);
                  }
                }}
                className={cn(
                  'h-12 rounded-xl text-base font-semibold transition-all active:scale-95',
                  key === ''
                    ? 'cursor-default'
                    : key === '⌫'
                      ? 'text-gray-500 hover:bg-gray-200'
                      : 'text-gray-900 hover:bg-amber-50 active:bg-amber-100',
                )}
                style={{
                  background: key === '' ? 'transparent' : key === '⌫' ? '#f3f4f6' : '#fff',
                  border: key === '' ? 'none' : '1.5px solid #e5e7eb',
                }}
              >
                {key}
              </button>
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 mt-auto">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" />
              </svg>
              <p className="text-sm font-medium text-red-600">{error}</p>
            </div>
          )}

          {/* Submit button */}
          <button
            type="button"
            onClick={onSubmitPin}
            disabled={isLoading || pin.length < 4}
            className="w-full h-11 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed mt-auto"
            style={{ background: 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)', boxShadow: '0 4px 20px rgba(245,158,11,0.35)' }}
          >
            {isLoading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Signing in…
              </>
            ) : 'Sign In with PIN'}
          </button>
        </div>
      )}

      {/* ── Footer ── */}
      <p className="text-center text-xs text-gray-400 mt-auto pt-2">
        BhojAI Restaurant OS · v1.0 · Powered by AI
      </p>
    </div>
  );
}
