'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { 
  ChefHat, 
  Utensils, 
  Pizza, 
  Coffee, 
  Flame, 
  Sparkles, 
  Soup, 
  Shield, 
  Users, 
  BarChart3, 
  Lock, 
  Mail, 
  User, 
  Eye, 
  EyeOff, 
  Check, 
  ArrowRight, 
  LockKeyhole, 
  Info,
  ShoppingCart,
  Store
} from 'lucide-react';
import apiClient from '@/services/apiClient';

interface RegisterFormProps {
  className?: string;
  onSuccess?: () => void;
}

export function RegisterForm({ className, onSuccess }: RegisterFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    agreeTerms: false
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Simple validation checks for password description
  const isPasswordValid = formData.password.length >= 8 && 
    /[A-Za-z]/.test(formData.password) && 
    /[0-9\W]/.test(formData.password);

  async function onSubmit(event: React.SyntheticEvent) {
    event.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!formData.agreeTerms) {
      setError('You must agree to the Terms of Service');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.post('/auth/register', {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        role: 'super_admin'
      });

      if (response.data) {
        if (response.data.token) {
          localStorage.setItem('token', response.data.token);
          localStorage.setItem('user', JSON.stringify(response.data.user));
        }
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
    <div className={cn('grid lg:grid-cols-2 min-h-[650px] w-full bg-[#111] text-white', className)}>
      
      {/* ── Left side: Marketing / Graphic Copy ── */}
      <div className="hidden lg:flex flex-col justify-between p-8 bg-[#161616]/40 rounded-l-2xl border-r border-white/5 relative overflow-hidden">
        {/* Abstract Background Grid/Glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent pointer-events-none" />

        {/* Top Section: Pill + Header */}
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-orange-500/10 text-orange-500 text-xs font-semibold border border-orange-500/20 mb-6">
            <Shield className="w-3.5 h-3.5" />
            Powering Smarter Restaurants
          </div>
          
          <h2 className="text-3xl font-extrabold text-white mb-3 tracking-tight leading-tight">
            Run. Manage.<br/>
            <span className="text-orange-500">Grow</span> with BhojAI.
          </h2>
          <p className="text-gray-400 text-sm leading-relaxed max-w-sm">
            BhojAI is the all-in-one operating system for restaurants. Manage orders, menus, staff, analytics and more — all from a single platform.
          </p>
        </div>

        {/* Side-by-Side Marketing and Graphic Grid */}
        <div className="flex flex-row items-center gap-4 my-6 relative z-10 flex-grow">
          
          {/* Left Column: Feature Highlights Panel */}
          <div className="w-[50%] space-y-6 shrink-0 relative z-20">
            <div className="flex gap-3 items-start transform transition-transform hover:translate-x-1 duration-300">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Store className="w-4 h-4 text-orange-500" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">Manage Multiple Outlets</h4>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">Create and manage multiple restaurant outlets under one platform.</p>
              </div>
            </div>

            <div className="flex gap-3 items-start transform transition-transform hover:translate-x-1 duration-300">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Users className="w-4 h-4 text-orange-500" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">Invite & Manage Staff</h4>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">Add your team members and control access with role-based permissions.</p>
              </div>
            </div>

            <div className="flex gap-3 items-start transform transition-transform hover:translate-x-1 duration-300">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <BarChart3 className="w-4 h-4 text-orange-500" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">Real-time Analytics</h4>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">Get insights that help you make better decisions and grow your business.</p>
              </div>
            </div>
          </div>

          {/* Right Column: Illustration Mockup */}
          <div className="w-[50%] relative h-[300px] flex items-center justify-center shrink-0 z-10">
            <div className="relative w-[260px] h-[300px] shrink-0">
              {/* Connecting SVG Dotted Lines */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-40" viewBox="0 0 260 300">
                {/* Orders Line */}
                <path d="M 55 45 C 75 45, 80 110, 95 120" stroke="#f97316" strokeWidth="1.5" strokeDasharray="3 3" fill="none" />
                {/* Kitchen Line */}
                <path d="M 205 55 C 185 55, 175 110, 160 120" stroke="#f97316" strokeWidth="1.5" strokeDasharray="3 3" fill="none" />
                {/* Analytics Line */}
                <path d="M 55 255 C 75 255, 80 190, 95 180" stroke="#f97316" strokeWidth="1.5" strokeDasharray="3 3" fill="none" />
                {/* Staff Line */}
                <path d="M 205 260 C 185 260, 175 190, 160 180" stroke="#f97316" strokeWidth="1.5" strokeDasharray="3 3" fill="none" />
              </svg>

              {/* Center storefront image */}
              <div className="absolute top-[65px] left-[10px] w-[240px] h-[170px] rounded-xl border border-white/10 shadow-[0_0_40px_rgba(249,115,22,0.2)] overflow-hidden bg-[#1f1f1f] transform transition-transform hover:scale-[1.02] duration-500" style={{ zIndex: 10 }}>
                <img 
                  src="/restaurant_storefront.png" 
                  alt="BhojAI Storefront" 
                  className="w-full h-full object-cover opacity-90"
                />
              </div>

              {/* Floating badges */}
              <div className="absolute top-[25px] left-[0px] bg-[#1a1a1a]/95 border border-white/10 px-3 py-1 rounded-full flex items-center gap-1.5 text-xs text-white shadow-lg animate-bounce" style={{ animationDuration: '4s', zIndex: 30 }}>
                <ShoppingCart className="w-3.5 h-3.5 text-orange-500" />
                <span>Orders</span>
              </div>

              <div className="absolute top-[35px] right-[0px] bg-[#1a1a1a]/95 border border-white/10 px-3 py-1 rounded-full flex items-center gap-1.5 text-xs text-white shadow-lg animate-bounce" style={{ animationDuration: '5s', animationDelay: '1s', zIndex: 30 }}>
                <ChefHat className="w-3.5 h-3.5 text-orange-500" />
                <span>Kitchen</span>
              </div>

              <div className="absolute bottom-[35px] left-[0px] bg-[#1a1a1a]/95 border border-white/10 px-3 py-1 rounded-full flex items-center gap-1.5 text-xs text-white shadow-lg animate-bounce" style={{ animationDuration: '4.5s', animationDelay: '0.5s', zIndex: 30 }}>
                <BarChart3 className="w-3.5 h-3.5 text-orange-500" />
                <span>Analytics</span>
              </div>

              <div className="absolute bottom-[40px] right-[0px] bg-[#1a1a1a]/95 border border-white/10 px-3 py-1 rounded-full flex items-center gap-1.5 text-xs text-white shadow-lg animate-bounce" style={{ animationDuration: '5.5s', animationDelay: '1.5s', zIndex: 30 }}>
                <Users className="w-3.5 h-3.5 text-orange-500" />
                <span>Staff</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Pill: Security Badge */}
        <div className="relative z-10 mt-6 py-2 px-4 rounded-xl border border-white/5 bg-[#141414]/30 flex items-center justify-center gap-2 text-xs text-gray-500">
          <LockKeyhole className="w-3.5 h-3.5 text-orange-500/70" />
          <span>Enterprise grade security</span>
          <span className="text-gray-700">•</span>
          <span>Your data is safe with us</span>
        </div>
      </div>

      {/* ── Right side: Form Panel ── */}
      <div className="flex flex-col justify-center p-8 lg:p-12 bg-[#111] relative z-10">
        
        {/* Crown Icon + Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-orange-500/10 text-orange-500 flex items-center justify-center border border-orange-500/20 shadow-md">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white tracking-tight">Create Super Admin Account</h3>
            <p className="text-xs text-gray-400 mt-0.5">Create your Super Admin account to get started and manage all restaurant outlets on BhojAI.</p>
          </div>
        </div>
        
        <form onSubmit={onSubmit} className="space-y-4">
          
          {/* Full Name */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-400 flex items-center gap-1">
              Full Name <span className="text-orange-500 font-bold">•</span>
            </Label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder="Enter your full name"
                disabled={isLoading}
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="h-11 pl-10 rounded-xl bg-[#1a1a1a] border-white/10 text-white placeholder:text-gray-500 focus:border-orange-500 focus:ring-orange-500/20 transition-all duration-300"
              />
            </div>
          </div>

          {/* Email Address */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-400 flex items-center gap-1">
              Email Address <span className="text-orange-500 font-bold">•</span>
            </Label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                type="email"
                placeholder="Enter your email address"
                disabled={isLoading}
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="h-11 pl-10 rounded-xl bg-[#1a1a1a] border-white/10 text-white placeholder:text-gray-500 focus:border-orange-500 focus:ring-orange-500/20 transition-all duration-300"
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-400 flex items-center gap-1">
              Password <span className="text-orange-500 font-bold">•</span>
            </Label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Create a strong password"
                disabled={isLoading}
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="h-11 pl-10 pr-10 rounded-xl bg-[#1a1a1a] border-white/10 text-white placeholder:text-gray-500 focus:border-orange-500 focus:ring-orange-500/20 transition-all duration-300"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            
            {/* Checklist below password */}
            <div className="flex items-center gap-2 mt-1">
              <div className={cn(
                'w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-all duration-300',
                isPasswordValid ? 'bg-green-500/20 text-green-500' : 'bg-white/5 text-gray-600'
              )}>
                <Check className="w-2.5 h-2.5" />
              </div>
              <span className={cn(
                'text-[10px] transition-all duration-300',
                isPasswordValid ? 'text-green-500' : 'text-gray-500'
              )}>
                Use at least 8 characters with a mix of letters, numbers & symbols
              </span>
            </div>
          </div>

          {/* Confirm Password */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-400 flex items-center gap-1">
              Confirm Password <span className="text-orange-500 font-bold">•</span>
            </Label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirm your password"
                disabled={isLoading}
                required
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="h-11 pl-10 pr-10 rounded-xl bg-[#1a1a1a] border-white/10 text-white placeholder:text-gray-500 focus:border-orange-500 focus:ring-orange-500/20 transition-all duration-300"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Terms checkbox */}
          <div className="flex items-center gap-2 pt-1">
            <input 
               type="checkbox" 
               id="terms" 
               className="rounded border-white/10 bg-[#1a1a1a] text-orange-500 focus:ring-orange-500/20 focus:ring-offset-[#111] cursor-pointer" 
               checked={formData.agreeTerms}
               onChange={(e) => setFormData({ ...formData, agreeTerms: e.target.checked })}
               required
            />
            <Label htmlFor="terms" className="text-xs text-gray-400 font-normal cursor-pointer select-none">
              I agree to the <span className="text-orange-500 hover:underline cursor-pointer">Terms of Service</span> and <span className="text-orange-500 hover:underline cursor-pointer">Privacy Policy</span>
            </Label>
          </div>

          {error && (
            <p className="text-xs font-medium text-red-400 bg-red-500/10 p-3 rounded-xl border border-red-500/20 animate-bounce">
              {error}
            </p>
          )}

          <Button 
             disabled={isLoading} 
             className="w-full h-12 mt-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 active:scale-[0.98] text-white font-bold rounded-xl shadow-lg shadow-orange-500/20 transition-all duration-300 flex items-center justify-center gap-2"
          >
            {isLoading && (
              <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            )}
            Create Account
            <ArrowRight className="w-4 h-4" />
          </Button>

          <p className="text-[10px] text-gray-500 text-center flex items-center justify-center gap-1.5 mt-2">
            <Info className="w-3.5 h-3.5 text-gray-600" />
            We'll send a verification email to confirm your account.
          </p>
        </form>
      </div>

    </div>
  );
}
