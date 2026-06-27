'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
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
        setPin(''); 
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
    <div className={cn('flex flex-col h-full p-8 gap-6 max-w-md w-full mx-auto bg-[#111] text-white rounded-2xl border border-white/5 shadow-2xl', className)}>

      {/* ── Header ── */}
      <div className="flex flex-col items-center justify-center pt-4 pb-2">
        <h2 className="text-2xl font-bold text-white tracking-tight">Welcome back</h2>
        <p className="text-sm text-gray-400 mt-1">Sign in to your account</p>
      </div>

      {/* ── Tabs ── */}
      <div className="flex rounded-xl p-1 gap-1 bg-[#1a1a1a]">
        <button
          type="button"
          onClick={() => { setActiveTab('password'); setError(null); }}
          className={cn(
            'flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-300',
            activeTab === 'password'
              ? 'bg-orange-500 text-white shadow-md'
              : 'text-gray-400 hover:text-white'
          )}
        >
          Password Login
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab('pin'); setError(null); }}
          className={cn(
            'flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-300',
            activeTab === 'pin'
              ? 'bg-orange-500 text-white shadow-md'
              : 'text-gray-400 hover:text-white'
          )}
        >
          Quick PIN
        </button>
      </div>

      {/* ── PASSWORD LOGIN TAB ── */}
      {activeTab === 'password' && (
        <form onSubmit={onSubmit} className="flex flex-col gap-4 flex-1 animate-in fade-in slide-in-from-right-4 duration-300">

          {/* Username */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-bold tracking-widest uppercase text-gray-400">
              Username
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
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
                  'w-full h-11 rounded-xl border pl-9 pr-4 text-sm text-white bg-[#1a1a1a] outline-none transition-all duration-300',
                  'border-white/10 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 placeholder:text-gray-500',
                  error && 'border-red-500/30'
                )}
              />
            </div>
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-bold tracking-widest uppercase text-gray-400">
              Password
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
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
                  'w-full h-11 rounded-xl border pl-9 pr-10 text-sm text-white bg-[#1a1a1a] outline-none transition-all duration-300',
                  'border-white/10 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 placeholder:text-gray-500',
                  error && 'border-red-500/30'
                )}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
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
            <label htmlFor="pin" className="text-xs font-bold tracking-widest uppercase text-gray-400">
              PIN <span className="normal-case font-normal">(Optional / Waiter 2FA)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
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
                className="w-full h-11 rounded-xl border border-white/10 pl-9 pr-4 text-sm text-white bg-[#1a1a1a] outline-none transition-all duration-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 placeholder:text-gray-500"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" />
              </svg>
              <p className="text-sm font-medium text-red-400">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="mt-auto w-full h-11 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all duration-300 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed bg-orange-500 hover:bg-orange-600 shadow-lg shadow-orange-500/20"
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
        <div className="flex flex-col gap-5 flex-1 animate-in fade-in slide-in-from-right-4 duration-300">

          {/* PIN display */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold tracking-widest uppercase text-gray-400">
              Enter your PIN
            </label>
            <div className="flex gap-3 justify-center mt-1">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-12 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all duration-300"
                  style={{
                    borderColor: i < pin.length ? '#f97316' : '#2a2a2a',
                    background: i < pin.length ? '#1f130b' : '#1a1a1a',
                    color: '#fff',
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
                  'h-12 rounded-xl text-base font-semibold transition-all duration-200 active:scale-95 text-white',
                  key === ''
                    ? 'cursor-default'
                    : key === '⌫'
                      ? 'hover:bg-white/5 active:bg-white/10'
                      : 'hover:bg-orange-500/10 active:bg-orange-500/20',
                )}
                style={{
                  background: key === '' ? 'transparent' : '#1a1a1a',
                  border: key === '' ? 'none' : '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {key}
              </button>
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2.5 mt-auto">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" />
              </svg>
              <p className="text-sm font-medium text-red-400">{error}</p>
            </div>
          )}

          {/* Submit button */}
          <button
            type="button"
            onClick={onSubmitPin}
            disabled={isLoading || pin.length < 4}
            className="w-full h-11 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all duration-300 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed mt-auto bg-orange-500 hover:bg-orange-600 shadow-lg shadow-orange-500/20"
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
      <div className="mt-4 pt-4 border-t border-white/5 flex justify-center">
        <p className="text-center text-xs text-gray-500">
          New to BhojAI? <a href="/register" className="text-orange-500 font-medium hover:underline transition-all">Create a Super Admin account</a>
        </p>
      </div>
    </div>
  );
}
