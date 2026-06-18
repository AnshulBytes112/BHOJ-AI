import { Router } from 'express';
import { pool } from '../db';
import { requireAdminRole } from '../middleware/admin-auth';

export const analyticsRouter = Router();

// Apply auth middleware to all analytics routes
analyticsRouter.use(requireAdminRole);

analyticsRouter.get('/dashboard', async (req, res) => {
  const restaurantId = (req as any).restaurantId || 1;
  
  let client;
  try {
    client = await pool.connect();
    
    // Total Sales & Subtotals for today
    const salesResult = await client.query(
      `SELECT 
         COALESCE(SUM(grand_total), 0) as total_sales,
         COALESCE(SUM(subtotal), 0) as subtotal,
         0 as discount,
         COALESCE(SUM(gst_total), 0) as tax
       FROM bills 
       WHERE restaurant_id = $1 AND DATE(created_at) = CURRENT_DATE`,
      [restaurantId]
    );
    const salesData = salesResult.rows[0];

    // Total Customers (guest count from sessions today)
    const customersResult = await client.query(
      `SELECT COALESCE(SUM(guest_count), 0) as total_customers
       FROM table_sessions ts
       LEFT JOIN session_tables st ON st.session_id = ts.session_id
       LEFT JOIN tables t ON t.table_id = st.table_id
       WHERE t.restaurant_id = $1 AND DATE(ts.started_at) = CURRENT_DATE`,
      [restaurantId]
    );
    const totalCustomers = parseInt(customersResult.rows[0].total_customers, 10);

    const totalSales = parseFloat(salesData.total_sales);
    const avgOrderValue = totalCustomers > 0 ? Math.round(totalSales / totalCustomers) : 0;

    // Simulated/Static metrics for UI fields we don't have DB models for yet
    const customerRetention = 68; // placeholder
    const customerSatisfaction = 4.8; // placeholder
    const salesGrowth = 12.5; // placeholder
    const customerGrowth = 8.2; // placeholder
    const avgOrderGrowth = 4.1; // placeholder
    const satisfactionGrowth = 0.2; // placeholder

    res.json({
      totalSales,
      subtotal: parseFloat(salesData.subtotal),
      discount: parseFloat(salesData.discount) || 0,
      tax: parseFloat(salesData.tax),
      totalCustomers,
      customerRetention,
      avgOrderValue,
      customerSatisfaction,
      salesGrowth,
      customerGrowth,
      avgOrderGrowth,
      satisfactionGrowth,
      salesData: {
        dineIn: [30, 40, 45, 50, 49, 60, 70, 91, 125], // Mock trend data
        online: [20, 25, 30, 35, 40, 45, 50, 60, 80],
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']
      }
    });

  } catch (err: any) {
    console.error('Analytics GET /dashboard error:', err);
    res.status(500).json({ message: 'Failed to fetch dashboard metrics', error: err.message || String(err) });
  } finally {
    if (client) {
      client.release();
    }
  }
});
