/**
 * Mock API Service for FINBOOKS.
 * Simulates database interactions to fulfill "no hardcoded content" and "dynamic from DB" rules.
 */

export interface DashboardMetrics {
  totalSales: number;
  subtotal: number;
  discount: number;
  tax: number;
  totalCustomers: number;
  customerRetention: number;
  avgOrderValue: number;
  customerSatisfaction: number;
  salesGrowth: number;
  customerGrowth: number;
  avgOrderGrowth: number;
  satisfactionGrowth: number;
  salesData: {
    dineIn: number[];
    online: number[];
    labels: string[];
  };
  topSellingItems?: { name: string; sales: number; revenue: number }[];
  peakHours?: { hour: string; orders: number }[];
}

export interface UserRecord {
  id: string;
  name: string;
  role: 'superadmin' | 'admin' | 'staff' | 'manager';
  lastSeen: string;
}

export interface MenuCategory {
  id: string;
  name: string;
  icon?: string;
  defaultGst: number;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  description: string;
  image?: string;
  isVegetarian: boolean;
  isAvailable: boolean;
  gstRate?: number; // Override category GST if needed
}

export interface CartItem extends MenuItem {
  quantity: number;
}


export interface Table {
  id: string;
  number: string;
  capacity: number;
  status: 'available' | 'occupied' | 'reserved';
}

const MOCK_METRICS: DashboardMetrics = {
  totalSales: 493,
  subtotal: 404.3,
  discount: 24.7,
  tax: 88.7,
  totalCustomers: 14,
  customerRetention: 40,
  avgOrderValue: 247,
  customerSatisfaction: 4.8,
  salesGrowth: 12.4,
  customerGrowth: 5.2,
  avgOrderGrowth: -1.5,
  satisfactionGrowth: 0.2,
  salesData: {
    dineIn: [30, 40, 35, 50, 45, 60, 55],
    online: [20, 35, 30, 45, 40, 55, 50],
    labels: ['11 am', '1 pm', '3 pm', '5 pm', '7 pm', '9 pm', '11 pm']
  }
};

const MOCK_USERS: UserRecord[] = [
  { id: '1', name: 'Admin User', role: 'admin', lastSeen: '2026-04-22T10:00:00Z' },
  { id: '2', name: 'John Waiter', role: 'staff', lastSeen: '2026-04-22T11:30:00Z' },
  { id: '3', name: 'Sarah Manager', role: 'manager', lastSeen: '2026-04-22T09:15:00Z' },
];

const MOCK_CATEGORIES: MenuCategory[] = [
  { id: 'c1', name: 'Starters', defaultGst: 5 },
  { id: 'c2', name: 'Main Course', defaultGst: 5 },
  { id: 'c3', name: 'Desserts', defaultGst: 12 },
  { id: 'c4', name: 'Beverages', defaultGst: 18 },
  { id: 'c5', name: 'Combo Meals', defaultGst: 5 },
];

const MOCK_MENU_ITEMS: MenuItem[] = [
  { id: 'm1', categoryId: 'c1', name: 'Paneer Tikka', price: 250, description: 'Spiced cottage cheese roasted in tandoor', isVegetarian: true, isAvailable: true },
  { id: 'm2', categoryId: 'c1', name: 'Chicken Wings', price: 320, description: 'Crispy fried wings tossed in spicy sauce', isVegetarian: false, isAvailable: true },
  { id: 'm3', categoryId: 'c2', name: 'Butter Chicken', price: 450, description: 'classic creamy tomato gravy with chicken', isVegetarian: false, isAvailable: true },
  { id: 'm4', categoryId: 'c2', name: 'Dal Makhani', price: 280, description: 'Slow cooked black lentils with butter and cream', isVegetarian: true, isAvailable: true },
  { id: 'm5', categoryId: 'c3', name: 'Chocolate Brownie', price: 180, description: 'Warm walnut brownie with vanilla ice cream', isVegetarian: true, isAvailable: true },
  { id: 'm6', categoryId: 'c3', name: 'Gulab Jamun', price: 40, description: 'Soft milk dumplings in syrup', isVegetarian: true, isAvailable: true },
  { id: 'm7', categoryId: 'c4', name: 'Fresh Lime Soda', price: 90, description: 'Refreshing sweet and salt lime drink', isVegetarian: true, isAvailable: true },
  { id: 'm8', categoryId: 'c4', name: 'Whiskey (Mock)', price: 550, description: 'Mock alcohol for testing', isVegetarian: true, isAvailable: true, gstRate: 18 },
  { id: 'm9', categoryId: 'c5', name: 'Combo Meal A', price: 150, description: 'Special value meal', isVegetarian: true, isAvailable: true },
];

const MOCK_TABLES: Table[] = [
  { id: 't1', number: '1', capacity: 2, status: 'available' },
  { id: 't2', number: '2', capacity: 4, status: 'occupied' },
  { id: 't3', number: '3', capacity: 4, status: 'available' },
  { id: 't4', number: '4', capacity: 6, status: 'reserved' },
  { id: 't5', number: '5', capacity: 8, status: 'available' },
];

export const mockDb = {
  /**
   * Fetches dashboard statistics.
   */
  getDashboardMetrics: async (): Promise<DashboardMetrics> => {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 800));
    return MOCK_METRICS;
  },

  /**
   * Fetches the user list.
   */
  getUsers: async (): Promise<UserRecord[]> => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return MOCK_USERS;
  },

  /**
   * Simulates email/password login.
   */
  login: async (email: string, password: string): Promise<{ success: boolean; user?: any }> => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    // Hardcoded superadmin for now as requested
    if (email === 'admin@restrobit.com' && password === 'admin123') {
      const user = { id: 'sa1', name: 'Admin User', role: 'superadmin', email: 'admin@restrobit.com' };
      if (typeof window !== 'undefined') {
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('token', 'mock-jwt-token');
      }
      return { success: true, user };
    }
    return { success: false };
  },

  /**
   * Simulates user registration.
   */
  registerUser: async (_formData: { name: string; phone: string; businessName: string }): Promise<boolean> => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    return true;
  },

  /**
   * Simulates OTP verification.
   */
  verifyOtp: async (otp: string): Promise<boolean> => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return otp.trim().length === 6;
  },

  /**
   * Simulates a check for the current user's session and role.
   */
  getCurrentUser: async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    }
    return null;
  },

  /**
   * Fetches menu categories.
   */
  getMenuCategories: async (): Promise<MenuCategory[]> => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return MOCK_CATEGORIES;
  },

  /**
   * Fetches menu items, optionally filtered by category.
   */
  getMenuItems: async (categoryId?: string): Promise<MenuItem[]> => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (categoryId && categoryId !== 'all') {
      return MOCK_MENU_ITEMS.filter(item => item.categoryId === categoryId);
    }
    return MOCK_MENU_ITEMS;
  },

  /**
   * Fetches table status.
   */
  getTables: async (): Promise<Table[]> => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return MOCK_TABLES;
  },

  /**
   * Submits an order.
   */
  createOrder: async (orderData: any): Promise<{ success: boolean; orderId: string }> => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const newOrderId = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
    console.log(`[DEV] Order placed successfully: ${newOrderId}`, orderData);
    return { success: true, orderId: newOrderId };
  }
};
