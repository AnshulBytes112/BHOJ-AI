'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UI_CONTENT } from '@/lib/content';
import { mockDb, DashboardMetrics } from '@/lib/mock-api';
import { formatCurrency } from '@/lib/utils';
import { TrendingUp, Users, DollarSign, Star, Loader2 } from 'lucide-react';

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { overview } = UI_CONTENT.navigation.admin;

  useEffect(() => {
    async function fetchData() {
      const data = await mockDb.getDashboardMetrics();
      setMetrics(data);
      setIsLoading(false);
    }
    fetchData();
  }, []);

  if (isLoading || !metrics) {
    return (
      <DashboardLayout>
        <div className="flex h-[60vh] w-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary opacity-50" />
        </div>
      </DashboardLayout>
    );
  }

  const cards = [
    {
      title: overview.totalSales,
      value: formatCurrency(metrics.totalSales),
      growth: metrics.salesGrowth,
      icon: DollarSign,
      color: 'bg-orange-500/10 text-orange-600',
    },
    {
      title: overview.totalCustomers,
      value: metrics.totalCustomers.toString(),
      growth: metrics.customerGrowth,
      icon: Users,
      color: 'bg-blue-500/10 text-blue-600',
    },
    {
      title: overview.avgOrder,
      value: formatCurrency(metrics.avgOrderValue),
      growth: null,
      icon: TrendingUp,
      color: 'bg-green-500/10 text-green-600',
    },
    {
      title: overview.satisfaction,
      value: `${metrics.customerSatisfaction}/5.0`,
      growth: null,
      icon: Star,
      color: 'bg-purple-500/10 text-purple-600',
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-black tracking-tight text-foreground">{overview.title}</h2>
          <p className="text-muted-foreground">Real-time performance metrics for your business.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <Card key={card.title} className="border-border shadow-sm hover:shadow-md transition-all duration-300">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                  {card.title}
                </CardTitle>
                <div className={`p-2 rounded-xl ${card.color}`}>
                  <card.icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-foreground">{card.value}</div>
                {card.growth && (
                  <div className="flex items-center mt-2">
                    <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-200 text-[10px] font-bold py-0 leading-tight">
                      +{card.growth}%
                    </Badge>
                    <span className="text-xs text-muted-foreground ml-2">
                      {overview.growth}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Placeholder for Charts / Recent Activity */}
        <div className="grid gap-6 lg:grid-cols-7">
          <Card className="lg:col-span-4 border-border shadow-sm min-h-[350px] flex items-center justify-center bg-card/50">
            <p className="text-muted-foreground italic">Interactive Sales Chart Coming Soon...</p>
          </Card>
          <Card className="lg:col-span-3 border-border shadow-sm min-h-[350px] flex items-center justify-center bg-card/50">
            <p className="text-muted-foreground italic">Recent Transactions Coming Soon...</p>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
