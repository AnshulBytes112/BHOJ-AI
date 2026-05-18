import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Hammer, Clock } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";

export default function ComingSoonPage() {
  return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center min-h-[80vh] p-4 text-center">
        <div className="bg-blue-50 p-6 rounded-full mb-8">
          <Hammer className="w-16 h-16 text-blue-500 animate-bounce" />
        </div>
        <h1 className="text-4xl font-extrabold text-gray-900 mb-4 tracking-tight">
          Coming Soon
        </h1>
        <p className="text-xl text-gray-600 max-w-lg mb-8">
          We're currently building something amazing here. This feature is part of our upcoming development phase.
        </p>
        <Card className="max-w-md w-full border-dashed border-2 bg-gray-50/50 shadow-none">
          <CardContent className="flex items-center gap-4 py-6">
            <div className="bg-white p-3 rounded-xl shadow-sm border">
              <Clock className="w-6 h-6 text-blue-600" />
            </div>
            <div className="text-left">
              <h3 className="font-bold text-gray-800">Under Development</h3>
              <p className="text-sm text-gray-500">In Progress • Expected soon</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
