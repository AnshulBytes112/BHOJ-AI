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

    // Fetch Customer Satisfaction and Recent Reviews
    const reviewsResult = await client.query(
      `SELECT rating, feedback, created_at, session_id
       FROM customer_reviews
       WHERE restaurant_id = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [restaurantId]
    );
    
    const recentReviews = reviewsResult.rows.map(r => ({
      rating: r.rating,
      feedback: r.feedback,
      date: r.created_at,
      sessionId: r.session_id
    }));

    const avgRatingResult = await client.query(
      `SELECT COALESCE(AVG(rating), 0) as avg_rating
       FROM customer_reviews
       WHERE restaurant_id = $1`,
      [restaurantId]
    );

    const dbCustomerSatisfaction = parseFloat(avgRatingResult.rows[0].avg_rating);
    const customerSatisfaction = dbCustomerSatisfaction > 0 ? Number(dbCustomerSatisfaction.toFixed(1)) : 4.8; // Fallback to 4.8 if no reviews yet

    // Simulated/Static metrics for UI fields we don't have DB models for yet
    const customerRetention = 68; // placeholder
    const salesGrowth = 12.5; // placeholder
    const customerGrowth = 8.2; // placeholder
    const avgOrderGrowth = 4.1; // placeholder
    const satisfactionGrowth = 0.2; // placeholder

    // --- 1. Revenue Chart Data (Last 7 Days) ---
    const trendResult = await client.query(
      `SELECT 
         DATE(created_at) as sale_date,
         COALESCE(SUM(grand_total), 0) as daily_total
       FROM bills
       WHERE restaurant_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '6 days'
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at) ASC`,
      [restaurantId]
    );

    const labels: string[] = [];
    const dineIn: number[] = [];
    
    // Fill the last 7 days even if no sales exist
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const row = trendResult.rows.find(r => {
        const rowDate = new Date(r.sale_date);
        return rowDate.toISOString().split('T')[0] === dateStr;
      });
      
      labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
      dineIn.push(row ? parseFloat(row.daily_total) : 0);
    }

    // --- 2. Top Selling Items ---
    const topItemsResult = await client.query(
      `SELECT 
         bi.item_name as name, 
         SUM(bi.quantity) as sales,
         SUM(bi.line_total) as revenue
       FROM bill_items bi
       JOIN bills b ON b.id = bi.bill_id
       WHERE b.restaurant_id = $1
       GROUP BY bi.item_name
       ORDER BY sales DESC
       LIMIT 5`,
      [restaurantId]
    );
    const topSellingItems = topItemsResult.rows.map(row => ({
      name: row.name,
      sales: parseInt(row.sales, 10),
      revenue: parseFloat(row.revenue)
    }));

    // --- 3. Peak Hours Heatmap (Today) ---
    const peakHoursResult = await client.query(
      `SELECT 
         EXTRACT(HOUR FROM created_at) as hour_of_day,
         COUNT(id) as order_count
       FROM bills
       WHERE restaurant_id = $1 AND DATE(created_at) = CURRENT_DATE
       GROUP BY EXTRACT(HOUR FROM created_at)
       ORDER BY hour_of_day ASC`,
      [restaurantId]
    );
    
    const peakHours = Array.from({ length: 24 }, (_, i) => {
      const row = peakHoursResult.rows.find(r => parseInt(r.hour_of_day, 10) === i);
      return {
        hour: `${i.toString().padStart(2, '0')}:00`,
        orders: row ? parseInt(row.order_count, 10) : 0
      };
    });

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
        dineIn,
        online: dineIn.map(v => Math.round(v * 0.3)), // Mock online sales as 30% of dineIn
        labels
      },
      topSellingItems,
      peakHours,
      recentReviews
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
