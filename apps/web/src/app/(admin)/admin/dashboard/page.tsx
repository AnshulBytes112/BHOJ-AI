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
import apiClient from '@/services/apiClient';

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
      try {
        const response = await apiClient.get('/analytics/dashboard');
        setMetrics(response.data);
      } catch (e) {
        console.error('Failed to fetch dashboard metrics:', e);
        // Fallback to mock data if API fails or backend is not ready
        const data = await mockDb.getDashboardMetrics();
        setMetrics(data);
      }
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
              <Button onClick={() => window.location.reload()} variant="outline" size="sm" className="bg-white rounded-xl gap-2 text-xs font-medium border shadow-sm h-11 px-4">
                <RefreshCcw size={14} />
                <span className="hidden sm:inline">{actionsContent.refresh || 'Refresh Data'}</span>
              </Button>
            </div>
          </div>

          {/* Metrics Grid */}
          <ResponsiveGrid columns={{ mobile: 2, tablet: 2, desktop: 4 }} className="mb-8">
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
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
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

              {/* Dynamic CSS Revenue Chart */}
              <div className="h-[250px] w-full relative flex items-end justify-between gap-2 px-2 pb-6 border-b border-dashed border-gray-200">
                {metrics.salesData.labels.map((label, idx) => {
                  const dineIn = metrics.salesData.dineIn[idx] || 0;
                  const online = metrics.salesData.online[idx] || 0;
                  const total = dineIn + online;
                  const maxVal = Math.max(...metrics.salesData.dineIn.map((d, i) => d + (metrics.salesData.online[i] || 0)), 1);
                  const heightPercent = Math.max((total / maxVal) * 100, 2);

                  return (
                    <div key={idx} className="relative flex flex-col justify-end items-center h-full group flex-1">
                      {/* Tooltip */}
                      <div className="absolute -top-10 bg-gray-900 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none whitespace-nowrap">
                        ₹{total.toFixed(0)} total
                      </div>
                      {/* Bar */}
                      <div
                        className="w-full max-w-[32px] bg-primary rounded-t-md overflow-hidden relative"
                        style={{ height: `${heightPercent}%`, transition: 'height 1s ease-out' }}
                      >
                        <div
                          className="absolute bottom-0 w-full bg-[#3d2b1f]"
                          style={{ height: `${(online / Math.max(total, 1)) * 100}%` }}
                        />
                      </div>
                      {/* Label */}
                      <span className="absolute -bottom-6 text-[10px] font-medium text-gray-500 whitespace-nowrap">{label}</span>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Peak Hours Heatmap */}
            <Card className="border-none shadow-sm bg-white rounded-3xl p-6 lg:col-span-1">
              <div className="flex justify-between items-center mb-6">
                <CardTitle className="text-lg font-bold">{chartsContent.popularTime.title}</CardTitle>
              </div>
              <div className="h-[250px] flex flex-col justify-between">
                {/* 4x6 Grid for 24 hours */}
                <div className="grid grid-cols-4 grid-rows-6 gap-1.5 h-[220px]">
                  {metrics.peakHours?.map((ph, idx) => {
                    const maxOrders = Math.max(...(metrics.peakHours?.map(p => p.orders) || []), 1);
                    const intensity = Math.max(0.1, ph.orders / maxOrders);
                    // Calculate color scale from light orange to dark orange/primary
                    return (
                      <div
                        key={idx}
                        title={`${ph.hour} - ${ph.orders} orders`}
                        className="rounded-sm flex items-center justify-center text-[8px] font-bold text-white transition-colors cursor-help hover:ring-2 hover:ring-amber-500 hover:ring-offset-1"
                        style={{
                          backgroundColor: `rgba(245, 158, 11, ${intensity})`,
                          color: intensity > 0.5 ? 'white' : 'transparent'
                        }}
                      >
                        {ph.orders > 0 ? ph.orders : ''}
                      </div>
                    );
                  }) || <div className="col-span-4 row-span-6 flex items-center justify-center text-sm text-gray-400">No data available</div>}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground font-medium px-1 mt-2">
                  <span>00:00</span>
                  <span>12:00</span>
                  <span>23:00</span>
                </div>
              </div>
            </Card>

            {/* Top Selling Items */}
            <Card className="border-none shadow-sm bg-white rounded-3xl p-6 lg:col-span-1">
              <div className="flex justify-between items-center mb-6">
                <CardTitle className="text-lg font-bold">Top Selling</CardTitle>
              </div>
              <div className="h-[250px] overflow-hidden flex flex-col gap-3">
                {metrics.topSellingItems?.length ? metrics.topSellingItems.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center p-2 hover:bg-gray-50 rounded-xl transition-colors">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold shrink-0">
                        #{idx + 1}
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-sm font-semibold text-gray-900 truncate" title={item.name}>{item.name}</p>
                        <p className="text-[10px] text-gray-500">{item.sales} orders</p>
                      </div>
                    </div>
                    <div className="text-sm font-bold text-gray-900 shrink-0">
                      ₹{item.revenue.toFixed(0)}
                    </div>
                  </div>
                )) : (
                  <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
                    No orders today
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Recent Reviews Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <Card className="border-none shadow-sm bg-white rounded-3xl p-6">
              <div className="flex justify-between items-center mb-6">
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <Star className="text-yellow-500 fill-yellow-500" size={20} />
                  Recent Customer Reviews
                </CardTitle>
              </div>
              <div className="flex flex-col gap-4">
                {metrics.recentReviews && metrics.recentReviews.length > 0 ? (
                  metrics.recentReviews.map((review, idx) => (
                    <div key={idx} className="p-4 bg-stone-50 rounded-2xl border border-stone-100 flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        <div className="flex gap-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              size={14}
                              className={i < review.rating ? "text-yellow-400 fill-yellow-400" : "text-stone-300"}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] text-stone-400 font-medium">
                          {new Date(review.date).toLocaleDateString()} {new Date(review.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {review.feedback ? (
                        <p className="text-sm text-gray-700 italic">"{review.feedback}"</p>
                      ) : (
                        <p className="text-sm text-stone-400 italic">No text feedback provided.</p>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-stone-400 text-sm flex flex-col items-center">
                    <Star size={32} className="opacity-20 mb-2" />
                    <p>No reviews collected yet.</p>
                  </div>
                )}
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
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
