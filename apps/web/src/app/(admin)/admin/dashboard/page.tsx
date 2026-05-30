'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { RoleGuard } from '@/components/auth/role-guard';
import { cn, formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Users, 
  Receipt, 
  Star,
  Clock,
  Zap,
  RefreshCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UI_CONTENT } from '@/lib/content';
import { mockDb, DashboardMetrics } from '@/lib/mock-api';
import { PageContainer } from '@/components/common/page-container';
import { ResponsiveGrid } from '@/components/common/responsive-grid';

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState('');

  const { admin } = UI_CONTENT.navigation;
  const content = admin.metrics;
  const chartsContent = admin.charts;
  const actionsContent = admin.actions;

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      const data = await mockDb.getDashboardMetrics();
      setMetrics(data);
      setIsLoading(false);
    };

    fetchData();

    // Update time
    const updateTime = () => {
      setCurrentTime(formatDate(new Date()));
    };

    updateTime();
    const timer = setInterval(updateTime, 60000);
    return () => clearInterval(timer);
  }, []);

  if (isLoading || !metrics) {
    return (
      <DashboardLayout>
        <div className="flex h-full items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <RoleGuard allowedRoles={['superadmin', 'admin']}>
      <DashboardLayout>
        <PageContainer className="p-0">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{admin.welcomeTitle}</h1>
              <p className="text-muted-foreground text-sm">{admin.welcomeSubtitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="bg-white px-3 py-1.5 rounded-xl border flex items-center gap-2 text-xs font-medium text-muted-foreground shadow-sm h-11 shrink-0">
                <Clock size={14} className="text-primary" />
                {currentTime}
              </div>
              <Button variant="outline" size="sm" className="bg-white rounded-xl gap-2 text-xs font-medium border shadow-sm h-11 px-4">
                <Zap size={14} className="text-primary fill-primary" />
                <span className="hidden sm:inline">{actionsContent.liveSync}</span>
              </Button>
              <Button variant="outline" size="sm" className="bg-white rounded-xl gap-2 text-xs font-medium border shadow-sm h-11 px-4">
                <Users size={14} className="text-primary" />
                <span className="hidden sm:inline">{actionsContent.waiterDesk}</span>
              </Button>
              <Button variant="outline" size="sm" className="bg-white rounded-xl gap-2 text-xs font-medium border shadow-sm h-11 px-4">
                <RefreshCcw size={14} />
                <span className="hidden sm:inline">{actionsContent.refresh}</span>
              </Button>
            </div>
          </div>

          {/* Metrics Grid */}
          <ResponsiveGrid columns={{ mobile: 1, tablet: 2, desktop: 4 }} className="mb-8">
            {/* Total Sales */}
            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden group hover:shadow-md transition-all">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{content.totalSales.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground mb-1">₹{metrics.totalSales}</div>
              <div className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-foreground text-white mb-4">
                {content.totalSales.footer}
              </div>
              <div className="grid grid-cols-3 gap-2 text-[10px] text-muted-foreground border-t pt-4">
                <div>
                  <p>{content.totalSales.subtotal}</p>
                  <p className="font-bold text-foreground">₹{metrics.subtotal}</p>
                </div>
                <div>
                  <p>{content.totalSales.discount}</p>
                  <p className="font-bold text-foreground">₹{metrics.discount}</p>
                </div>
                <div>
                  <p>{content.totalSales.tax}</p>
                  <p className="font-bold text-foreground">₹{metrics.tax}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Total Customers */}
          <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden hover:shadow-md transition-all">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{content.totalCustomers.label}</CardTitle>
              <div className="p-2 bg-blue-50 rounded-xl">
                <Users size={18} className="text-blue-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground mb-1">{metrics.totalCustomers}</div>
              <div className={cn(
                "text-[10px] font-bold mb-6",
                metrics.customerGrowth >= 0 ? "text-green-500" : "text-red-500"
              )}>
                {metrics.customerGrowth >= 0 ? '+' : ''}{metrics.customerGrowth}% 
                <span className="text-muted-foreground font-normal ml-1">{content.totalCustomers.footer}</span>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">{content.totalCustomers.retention}</p>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${metrics.customerRetention}%` }} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Avg Order Value */}
          <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden hover:shadow-md transition-all">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{content.avgOrder.label}</CardTitle>
              <div className="p-2 bg-red-50 rounded-xl">
                <Receipt size={18} className="text-red-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground mb-1">₹{metrics.avgOrderValue}</div>
              <div className={cn(
                "text-[10px] font-bold mb-6",
                metrics.avgOrderGrowth >= 0 ? "text-green-500" : "text-red-500"
              )}>
                {metrics.avgOrderGrowth >= 0 ? '+' : ''}{metrics.avgOrderGrowth}% 
                <span className="text-muted-foreground font-normal ml-1">{content.avgOrder.footer}</span>
              </div>
              <div className="flex gap-1 items-end h-8">
                {[30, 45, 25, 60, 40, 50, 80, 40, 100].map((h, i) => (
                  <div key={i} className={cn("flex-1 bg-red-100 rounded-sm", i === 8 && "bg-red-500")} style={{ height: `${h}%` }} />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Customer Satisfaction */}
          <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden hover:shadow-md transition-all">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{content.satisfaction.label}</CardTitle>
              <div className="p-2 bg-yellow-50 rounded-xl">
                <Star size={18} className="text-yellow-500 fill-yellow-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-1">
                <div className="text-3xl font-bold text-foreground">{metrics.customerSatisfaction}</div>
                <Star size={20} className="text-yellow-400 fill-yellow-400" />
              </div>
              <div className={cn(
                "text-[10px] font-bold mb-8",
                metrics.satisfactionGrowth >= 0 ? "text-green-500" : "text-red-500"
              )}>
                {metrics.satisfactionGrowth >= 0 ? '+' : ''}{metrics.satisfactionGrowth} 
                <span className="text-muted-foreground font-normal ml-1">{content.satisfaction.footer}</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-tight">
                {content.satisfaction.reviewsSource}
              </p>
            </CardContent>
          </Card>
        </ResponsiveGrid>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 border-none shadow-sm bg-white rounded-3xl p-6">
            <div className="flex justify-between items-center mb-6">
              <CardTitle className="text-lg font-bold">{chartsContent.sales.title}</CardTitle>
              <div className="flex gap-4">
                <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  {chartsContent.sales.dineIn}
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground">
                  <div className="w-2 h-2 rounded-full bg-[#3d2b1f]" />
                  {chartsContent.sales.online}
                </div>
              </div>
            </div>
            <div className="h-[250px] w-full relative">
              <svg className="w-full h-full" viewBox="0 0 800 200" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="gradient-orange" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path 
                  d="M0 150 Q 100 160, 200 140 T 400 130 T 600 80 T 800 100" 
                  fill="none" 
                  stroke="var(--primary)" 
                  strokeWidth="4" 
                />
                <path 
                  d="M0 150 Q 100 160, 200 140 T 400 130 T 600 80 T 800 100 V 200 H 0 Z" 
                  fill="url(#gradient-orange)" 
                />
                <path 
                  d="M0 110 Q 150 120, 300 170 T 500 130 T 700 110 T 800 115" 
                  fill="none" 
                  stroke="#3d2b1f" 
                  strokeWidth="4" 
                />
              </svg>
              <div className="flex justify-between mt-4 text-[10px] text-muted-foreground font-medium px-2">
                {metrics.salesData.labels.map((label, idx) => (
                  <span key={idx}>{label}</span>
                ))}
              </div>
            </div>
          </Card>

          <Card className="border-none shadow-sm bg-white rounded-3xl p-6">
            <div className="flex justify-between items-center mb-6">
              <CardTitle className="text-lg font-bold">{chartsContent.popularTime.title}</CardTitle>
              <Button variant="ghost" size="sm" className="text-[10px] font-bold h-6 gap-1 px-2">
                {chartsContent.popularTime.filter} <ChevronRight size={12} />
              </Button>
            </div>
            <div className="h-[250px] flex flex-col justify-end border-b border-l border-dashed border-muted px-4 py-2 relative">
               <div className="flex justify-between text-[10px] text-muted-foreground font-medium absolute bottom-[-24px] w-full left-0 px-2">
                <span>15:00</span>
                <span>17:00</span>
                <span>19:00</span>
                <span>21:00</span>
                <span>23:00</span>
              </div>
            </div>
          </Card>
        </div>
        </PageContainer>
      </DashboardLayout>
    </RoleGuard>
  );
}

function ChevronRight({ size = 16, className = "" }: { size?: number, className?: string }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="m9 18 6-6-6-6"/>
    </svg>
  );
}
