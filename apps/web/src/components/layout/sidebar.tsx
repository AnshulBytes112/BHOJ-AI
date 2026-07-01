'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Receipt,
  UtensilsCrossed,
  Table as TableIcon,
  CalendarDays,
  Store,
  Package,
  CreditCard,
  FileText,
  Users,
  LogOut,
  ChevronRight,
  Settings,
  Layers
} from 'lucide-react';

type MenuItem = { icon: any; label: string; href: string; badge?: number | string };

const MENU_ITEMS: MenuItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/admin/dashboard' },
  { icon: Receipt, label: 'POS', href: '/admin/pos' },
  { icon: FileText, label: 'Orders', href: '/admin/orders' },
  { icon: UtensilsCrossed, label: 'KOT', href: '/admin/kitchen' },
  { icon: TableIcon, label: 'Table', href: '/admin/tables' },
  { icon: Layers, label: 'Pricing', href: '/admin/pricing' },
  { icon: Store, label: 'Catalogue', href: '/admin/catalog' },
  { icon: FileText, label: 'Bills', href: '/admin/bills' },
  { icon: FileText, label: 'Invoice', href: '/admin/invoices' },
  { icon: Settings, label: 'Tax & Charges', href: '/admin/settings/gst' },
  { icon: FileText, label: 'Receipt Layout', href: '/admin/settings/receipt-layout' },
  { icon: Users, label: 'User', href: '/admin/users' },
];


interface SidebarProps {
  collapsed?: boolean;
}

export function Sidebar({ collapsed = false }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout, isStaff } = useAuth();

  const [restaurantName, setRestaurantName] = React.useState('BhojAI');
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('restaurant_name');
      if (stored) {
        setRestaurantName(stored);
      } else if (user?.restaurantName) {
        setRestaurantName(user.restaurantName);
        localStorage.setItem('restaurant_name', user.restaurantName);
      }
    }
  }, [user]);

  const filteredMenuItems = MENU_ITEMS.filter((item) => {
    if (isStaff) {
      // Waiters should only see operational modules
      return ['POS', 'Orders', 'KOT', 'Table'].includes(item.label);
    }
    return true; // Admins and Superadmins see all options
  });

  return (
    <aside
      className={cn(
        "h-full bg-card border-r border-border flex flex-col transition-all duration-300 shadow-sm print:hidden",
        collapsed ? "w-[80px]" : "w-[260px]"
      )}
    >
      {/* Brand */}
      <div className={cn("p-6 flex items-center", collapsed ? "justify-center" : "gap-3")}>
        <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-primary-foreground font-bold text-xl shadow-lg shadow-primary/20 shrink-0">
          <UtensilsCrossed size={24} />
        </div>
        {!collapsed && (
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">{restaurantName}</h1>
          </div>
        )}
      </div>

      {/* Profile */}
      <div className={cn("px-6 py-4 flex items-center mb-4", collapsed ? "justify-center" : "gap-3")}>
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 border-primary/20 shrink-0">
          <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="User" />
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate text-foreground">{user?.name || 'Admin User'}</p>
            <p className="text-xs text-muted-foreground capitalize">{user?.role || 'Waiter'}</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className={cn("flex-1 px-4 overflow-y-auto space-y-1 py-4 scrollbar-hide", collapsed && "px-2")}>
        {filteredMenuItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center rounded-xl transition-all group relative",
                collapsed ? "justify-center p-3" : "gap-3 px-4 py-3",
                isActive
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon size={20} className={cn("transition-colors shrink-0", isActive ? "text-primary-foreground" : "group-hover:text-primary")} />
              {!collapsed && (
                <>
                  <span className="flex-1 font-medium text-sm truncate">{item.label}</span>
                  {item.badge && (
                    <span className={cn(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                      isActive ? "bg-white/20 text-white" : "bg-muted-foreground/20 text-muted-foreground"
                    )}>
                      {item.badge}
                    </span>
                  )}
                </>
              )}
              {isActive && !collapsed && (
                <div className="absolute left-0 w-1 h-6 bg-white rounded-r-full transform translate-x-[-16px]" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t">
        <button
          onClick={() => logout()}
          title={collapsed ? "Logout" : undefined}
          className={cn(
            "flex items-center text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-xl transition-all group",
            collapsed ? "justify-center p-3 w-full" : "w-full gap-3 px-4 py-3"
          )}
        >
          <LogOut size={20} className="shrink-0" />
          {!collapsed && <span className="font-medium text-sm">Logout</span>}
        </button>
      </div>
    </aside>
  );
}
