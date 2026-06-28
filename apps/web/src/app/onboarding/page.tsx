'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Building2, MapPin, Calculator, Users } from 'lucide-react';

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Form State
  const [tenantName, setTenantName] = useState('');
  const [outletName, setOutletName] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [staffEmail, setStaffEmail] = useState('');

  const steps = [
    { id: 1, title: 'Organization', icon: Building2 },
    { id: 2, title: 'First Outlet', icon: MapPin },
    { id: 3, title: 'Configuration', icon: Calculator },
    { id: 4, title: 'Invite Staff', icon: Users },
  ];

  const handleNext = () => {
    if (step < 5) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleFinish = async () => {
    setLoading(true);
    // Simulate API call to save onboarding data
    setTimeout(() => {
      setLoading(false);
      router.push('/admin/dashboard');
    }, 1500);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      
      {/* Progress Header */}
      <div className="bg-gray-50 border-b border-gray-100 p-6">
        <div className="flex justify-between items-center max-w-lg mx-auto relative">
          <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-200 -z-10 -translate-y-1/2"></div>
          
          {steps.map((s) => (
            <div key={s.id} className="flex flex-col items-center gap-2 bg-gray-50 px-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                step > s.id 
                  ? 'bg-green-500 border-green-500 text-white' 
                  : step === s.id 
                    ? 'bg-orange-500 border-orange-500 text-white' 
                    : 'bg-white border-gray-300 text-gray-400'
              }`}>
                {step > s.id ? <CheckCircle2 className="w-5 h-5" /> : <s.icon className="w-4 h-4" />}
              </div>
              <span className={`text-xs font-semibold ${step >= s.id ? 'text-gray-900' : 'text-gray-400'}`}>
                {s.title}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="p-8 md:p-12 max-w-2xl mx-auto">
        
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Create Organization</h2>
              <p className="text-gray-500">What is the name of your restaurant brand or company?</p>
            </div>
            
            <div className="space-y-2">
              <Label>Organization Name</Label>
              <Input 
                 placeholder="e.g. Spice Garden Group" 
                 value={tenantName}
                 onChange={(e) => setTenantName(e.target.value)}
                 className="h-12 text-lg"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Create First Outlet</h2>
              <p className="text-gray-500">Add your first restaurant location.</p>
            </div>
            
            <div className="space-y-2">
              <Label>Outlet Name</Label>
              <Input 
                 placeholder="e.g. Spice Garden - Downtown" 
                 value={outletName}
                 onChange={(e) => setOutletName(e.target.value)}
                 className="h-12 text-lg"
              />
            </div>
            <div className="space-y-2">
              <Label>Address (Optional)</Label>
              <Input 
                 placeholder="Enter full address" 
                 className="h-12"
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Configure Settings</h2>
              <p className="text-gray-500">Set up regional defaults for this outlet.</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Currency</Label>
                <select 
                   value={currency}
                   onChange={(e) => setCurrency(e.target.value)}
                   className="w-full h-12 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                >
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Timezone</Label>
                <select 
                   value={timezone}
                   onChange={(e) => setTimezone(e.target.value)}
                   className="w-full h-12 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                  <option value="America/New_York">Eastern Time (ET)</option>
                  <option value="Europe/London">London (GMT)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Invite Your Team</h2>
              <p className="text-gray-500">Invite a manager or staff member to join this outlet (Optional).</p>
            </div>
            
            <div className="space-y-2">
              <Label>Staff Email</Label>
              <Input 
                 type="email"
                 placeholder="staff@example.com" 
                 value={staffEmail}
                 onChange={(e) => setStaffEmail(e.target.value)}
                 className="h-12"
              />
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-6 text-center animate-in fade-in zoom-in-95">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">You're All Set!</h2>
            <p className="text-gray-500 text-lg max-w-md mx-auto">
              Your organization and first outlet have been successfully configured.
            </p>
          </div>
        )}

      </div>

      {/* Footer Navigation */}
      <div className="bg-gray-50 border-t border-gray-100 p-6 flex justify-between items-center">
        {step > 1 && step < 5 ? (
          <Button variant="outline" onClick={handleBack} className="w-24">
            Back
          </Button>
        ) : <div />}
        
        {step < 4 ? (
          <Button 
             onClick={handleNext} 
             className="w-32 bg-orange-500 hover:bg-orange-600 text-white"
             disabled={
               (step === 1 && !tenantName) || 
               (step === 2 && !outletName)
             }
          >
            Continue
          </Button>
        ) : step === 4 ? (
          <Button onClick={() => setStep(5)} className="w-32 bg-orange-500 hover:bg-orange-600 text-white">
            Complete Setup
          </Button>
        ) : (
          <Button onClick={handleFinish} disabled={loading} className="w-48 bg-orange-500 hover:bg-orange-600 text-white mx-auto">
            {loading ? 'Entering Workspace...' : 'Go to Dashboard'}
          </Button>
        )}
      </div>

    </div>
  );
}
