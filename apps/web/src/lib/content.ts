/**
 * Centralized content repository for FINBOOKS.
 * As per AI Guidelines, all user-facing text must be dynamic/configurable.
 * This file serves as the initial source of truth and can be mapped to an API in the future.
 */

export const UI_CONTENT = {
  metadata: {
    title: 'FINBOOKS | POS & Restaurant Management',
    description: 'Production-grade POS, Billing, Inventory, and Reporting platform.',
  },
  auth: {
    login: {
      title: 'Welcome Back',
      description: 'Enter your credentials to access your workspace.',
      emailLabel: 'Email Address',
      emailPlaceholder: 'admin@finbooks.com',
      passwordLabel: 'Password',
      passwordPlaceholder: '••••••••',
      submitButton: 'Sign In',
      errorInvalid: 'Invalid email or password.',
    },
    register: {
      title: 'Create Account',
      description: 'Set up your restaurant workspace and verify access.',
      nameLabel: 'Full Name',
      namePlaceholder: 'Anshul Kumar',
      phoneLabel: 'Phone Number',
      phonePlaceholder: '+91 98765 43210',
      businessLabel: 'Business Name',
      businessPlaceholder: 'RestroBit Downtown',
      submitButton: 'Continue',
      errorSubmit: 'Unable to register right now. Please try again.',
    },
    verify: {
      title: 'Verify Access',
      description: 'Enter the 6-digit OTP sent to your phone number.',
      otpLabel: 'One-Time Password',
      otpPlaceholder: '123456',
      submitButton: 'Verify',
      resendLink: 'Resend OTP',
      errorInvalid: 'Invalid OTP. Please try again.',
    },
    logout: {
      label: 'Logout',
    },
  },
  common: {
    search: {
      placeholder: 'Search for orders, tables, or inventory...',
    },
    status: {
      live: 'System Live',
    },
  },
  navigation: {
    admin: {
      title: 'ADMIN',
      dashboard: 'Dashboard',
      inventory: 'Inventory Control',
      reports: 'Global Reports',
      settings: 'System Settings',
      welcomeTitle: 'Welcome to Dashboard',
      welcomeSubtitle: 'Overview of your restaurant\'s performance • Live Sync Active',
      metrics: {
        totalSales: {
          label: 'Total Sales',
          subtotal: 'Subtotal',
          discount: 'Discount',
          tax: 'Tax',
          footer: 'Total Sales Performance'
        },
        totalCustomers: {
          label: 'Total Customers',
          footer: 'vs yesterday',
          retention: 'Retention'
        },
        avgOrder: {
          label: 'Avg Order Value',
          footer: 'vs yesterday'
        },
        satisfaction: {
          label: 'Customer Satisfaction',
          footer: 'from last week',
          reviewsSource: 'Based on customer feedback'
        }
      },
      charts: {
        sales: {
          title: 'Sales | Dine In & Ordering',
          dineIn: 'Dine In',
          online: 'Online Ordering'
        },
        popularTime: {
          title: 'Popular Time',
          filter: 'Today'
        }
      },
      actions: {
        liveSync: 'Live Sync',
        waiterDesk: 'Waiter Desk',
        refresh: 'Refresh Data'
      },
      overview: {
        title: 'Business Overview',
        totalSales: 'Total Sales',
        totalCustomers: 'Total Customers',
        avgOrder: 'Avg Order Value',
        satisfaction: 'Customer Satisfaction',
        growth: 'vs last month',
      },
      users: {
        title: 'User Management',
        description: 'Manage staff roles and system access.',
        table: {
          name: 'Name',
          role: 'Role',
          lastSeen: 'Last Seen',
          actions: 'Actions',
        }
      }
    },
    user: {
      dashboard: 'Dashboard',
      pos: 'POS / Billing',
      orders: 'Manage Orders',
      tables: 'Table Layout',
      reservations: 'Reservations',
      inventory: 'Inventory',
      customers: 'Customers',
      payments: 'Payments',
      reports: 'Reports',
      settings: 'Settings',
    }
  },
  pos: {
    terminal: {
      allCategories: 'All Menu',
      searchPlaceholder: 'Search menu items...',
      cartTitle: 'Current Order',
      emptyCart: 'Cart is empty. Add items from the menu.',
      subtotal: 'Subtotal',
      tax: 'GST (5%)',
      total: 'Total',
      placeOrder: 'Place Order',
      tableSelect: 'Select Table',
      toGo: 'To Go (Takeaway)',
      orderSuccess: 'Order Placed Successfully',
      printReceipt: 'Print Receipt',
      newOrder: 'New Order'
    }
  }
};
