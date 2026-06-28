'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, MapPin } from 'lucide-react';

export default function OutletsPage() {
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Outlets</h1>
          <p className="text-sm text-gray-500 mt-1">Create and manage all your restaurant outlets.</p>
        </div>
        {!showAddForm && (
          <Button 
            onClick={() => setShowAddForm(true)} 
            className="bg-orange-500 hover:bg-orange-600 text-white flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add New Outlet
          </Button>
        )}
      </div>

      {showAddForm ? (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Add New Outlet</h2>
          </div>
          
          <div className="p-6 space-y-8">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Basic Information</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label>Outlet Name</Label>
                  <Input placeholder="Enter outlet name" />
                </div>
                <div className="space-y-2">
                  <Label>Outlet Code (Optional)</Label>
                  <Input placeholder="e.g. SG001" />
                </div>
                <div className="space-y-2">
                  <Label>Cuisine Type</Label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">Select cuisine type</option>
                    <option value="indian">Indian</option>
                    <option value="italian">Italian</option>
                    <option value="cafe">Cafe / Bakery</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <Input type="tel" placeholder="Enter contact number" />
                </div>
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input type="email" placeholder="Enter email address" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Address</Label>
                <textarea 
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px]"
                  placeholder="Enter complete address"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input placeholder="Enter city" />
                </div>
                <div className="space-y-2">
                  <Label>State</Label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">Select state</option>
                    <option value="maharashtra">Maharashtra</option>
                    <option value="delhi">Delhi</option>
                    <option value="karnataka">Karnataka</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>PIN Code</Label>
                  <Input placeholder="Enter PIN code" />
                </div>
              </div>
            </div>

            <hr className="border-gray-100" />

            {/* Configuration */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Configuration</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                    <option value="America/New_York">Eastern Time (ET)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Date Format</Label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="DD-MM-YYYY">DD-MM-YYYY</option>
                    <option value="MM-DD-YYYY">MM-DD-YYYY</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
          
          <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/50 rounded-b-xl">
            <Button variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white">Create Outlet</Button>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
             <MapPin className="w-8 h-8 text-orange-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Outlets Found</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Get started by creating your first restaurant outlet. You can configure menus, staff, and settings per outlet.
          </p>
          <Button 
            onClick={() => setShowAddForm(true)} 
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            Create Your First Outlet
          </Button>
        </div>
      )}

    </div>
  );
}
