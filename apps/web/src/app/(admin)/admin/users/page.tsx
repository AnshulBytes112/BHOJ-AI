'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UI_CONTENT } from '@/lib/content';
import { mockDb, UserRecord } from '@/lib/mock-api';
import { formatDate } from '@/lib/utils';
import { Loader2, MoreVertical, ShieldCheck, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function UserManagementPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const { users: userContent } = UI_CONTENT.navigation.admin;

  useEffect(() => {
    async function fetchData() {
      const data = await mockDb.getUsers();
      setUsers(data);
      setIsLoading(false);
    }
    fetchData();
  }, []);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex h-[60vh] w-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary opacity-50" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex justify-between items-end">
          <div className="space-y-1">
            <h2 className="text-3xl font-black tracking-tight text-foreground">{userContent.title}</h2>
            <p className="text-muted-foreground">{userContent.description}</p>
          </div>
          <Button className="bg-primary text-primary-foreground font-bold rounded-xl shadow-lg shadow-primary/20">
            + Add Staff Member
          </Button>
        </div>

        <Card className="border-border shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="font-bold text-foreground py-4">{userContent.table.name}</TableHead>
                  <TableHead className="font-bold text-foreground">{userContent.table.role}</TableHead>
                  <TableHead className="font-bold text-foreground">{userContent.table.lastSeen}</TableHead>
                  <TableHead className="text-right font-bold text-foreground">{userContent.table.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id} className="border-border hover:bg-muted/10 transition-colors">
                    <TableCell className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                          <UserIcon className="h-5 w-5 text-primary" />
                        </div>
                        <span className="font-bold text-foreground">{user.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={cn(
                          'uppercase text-[10px] font-black tracking-widest px-2 py-0.5',
                          user.role === 'admin' ? 'bg-orange-500 text-white border-none' :
                          user.role === 'manager' ? 'bg-blue-500/10 text-blue-700 border-blue-200' :
                          'bg-slate-100 text-slate-700 border-slate-200'
                        )}
                      >
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(user.lastSeen)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground rounded-full">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

import { cn } from '@/lib/utils';
