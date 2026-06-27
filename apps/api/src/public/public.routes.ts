import { Router } from 'express';
import { randomBytes } from 'crypto';
import { pool } from '../db';
import { broadcastToAdmins, broadcastToTable } from '../websocket';
import { fetchSessionState, deriveTableVisualState } from '../tables/table-management';
import { generateKotForOrder } from '../orders/kot-utils';

export const publicRouter = Router();

// 0. POST /api/public/register — Register new restaurant and superadmin user
publicRouter.post('/register', async (req, res) => {
  const { name, phone, businessName } = req.body;
  if (!name || !phone || !businessName) {
    return res.status(400).json({ message: 'Name, phone number, and business name are required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Insert the new restaurant
    const restResult = await client.query(
      `INSERT INTO restaurants (name, phone, owner_name)
       VALUES ($1, $2, $3)
       RETURNING id, name`,
      [businessName, phone, name]
    );
    const newRestaurant = restResult.rows[0];

    // Set app.current_restaurant_id to this new restaurant ID inside the transaction
    // so we can insert the users, tables, categories, etc., without RLS blocking it.
    await client.query(`SET app.current_restaurant_id = '${newRestaurant.id}'`);

    // 2. Insert the SUPERADMIN user
    const userResult = await client.query(
      `INSERT INTO users (username, display_name, role, restaurant_id)
       VALUES ($1, $2, 'SUPERADMIN', $3)
       ON CONFLICT (username)
       DO UPDATE SET display_name = $2, role = 'SUPERADMIN', restaurant_id = $3
       RETURNING id, username, display_name, role, restaurant_id`,
      [phone, name, newRestaurant.id]
    );
    const newUser = userResult.rows[0];

    // 3. Seed default categories, sections, gst config, receipt layout, and tables for the new restaurant
    const defaultCategories = ['Starters', 'Main Course', 'Desserts', 'Beverages'];
    for (const catName of defaultCategories) {
      await client.query(
        `INSERT INTO categories (name, restaurant_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [catName, newRestaurant.id]
      );
      
      await client.query(
        `INSERT INTO gst_config (label, category, gst_percentage, restaurant_id)
         VALUES ($1, $2, 5.00, $3)
         ON CONFLICT DO NOTHING`,
        [catName, catName, newRestaurant.id]
      );
    }

    const defaultSections = [
      ['Kitchen', 'Main kitchen section for food items'],
      ['Bar', 'Bar section for alcoholic and mixed drinks'],
      ['Ice Cream', 'Ice cream and dessert counter'],
      ['Beverage', 'Non-alcoholic beverages, coffee, and juices']
    ];
    for (const [secName, secDesc] of defaultSections) {
      await client.query(
        `INSERT INTO sections (section_name, description, is_active, restaurant_id)
         VALUES ($1, $2, true, $3)
         ON CONFLICT DO NOTHING`,
        [secName, secDesc, newRestaurant.id]
      );
    }

    // Add 5 default tables
    for (let i = 1; i <= 5; i++) {
      await client.query(
        `INSERT INTO tables (table_number, status, restaurant_id)
         VALUES ($1, 'free', $2)
         ON CONFLICT DO NOTHING`,
        [`${i}`, newRestaurant.id]
      );
    }

    // Add a default receipt layout
    await client.query(
      `INSERT INTO receipt_layout (header_text, footer_text, restaurant_id)
       VALUES ($1, 'Thank you for visiting! Come again.', $2)
       ON CONFLICT DO NOTHING`,
      [businessName, newRestaurant.id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Restaurant registered successfully.',
      restaurant: newRestaurant,
      user: {
        id: newUser.id,
        name: newUser.display_name,
        role: 'SUPERADMIN',
        email: `${phone}@restrobit.com`,
        restaurantName: newRestaurant.name,
      }
    });

  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Registration failed:', err);
    res.status(500).json({ message: err.message || 'Failed to register restaurant.' });
  } finally {
    client.release();
  }
});

publicRouter.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (email === 'admin@restrobit.com' && password === 'admin123') {
    const adminResult = await pool.query("SELECT id, username, display_name, role FROM users WHERE username = 'admin' OR role = 'SUPERADMIN' LIMIT 1");
    const userObj = adminResult.rows[0] || { id: 1, username: 'admin', display_name: 'BhojAI Admin', role: 'SUPERADMIN' };
    return res.json({
      success: true,
      user: {
        id: userObj.id,
        name: userObj.display_name,
        role: userObj.role.toLowerCase(),
        email: 'admin@restrobit.com',
        restaurantName: 'BhojAI'
      }
    });
  }

  if (email === 'waiter@bhojai.com' && password === 'waiter123') {
    const waiterResult = await pool.query("SELECT id, username, display_name, role FROM users WHERE username = 'waiter1' LIMIT 1");
    if (waiterResult.rows.length > 0) {
      const userObj = waiterResult.rows[0];
      return res.json({
        success: true,
        user: {
          id: userObj.id,
          name: userObj.display_name,
          role: userObj.role.toLowerCase(),
          email: 'waiter@bhojai.com',
          restaurantName: 'BhojAI'
        }
      });
    }
  }

  const phone = email.split('@')[0];
  try {
    const userResult = await pool.query(
      `SELECT u.id, u.username, u.display_name, u.role, r.name as restaurant_name
       FROM users u
       JOIN restaurants r ON r.id = u.restaurant_id
       WHERE u.username = $1 OR u.username = $2`,
      [email, phone]
    );
    if (userResult.rows.length > 0) {
      const userObj = userResult.rows[0];
      return res.json({
        success: true,
        user: {
          id: userObj.id,
          name: userObj.display_name,
          role: userObj.role.toLowerCase(),
          email: email,
          restaurantName: userObj.restaurant_name
        }
      });
    }
  } catch (e) {
    console.error('Login database query error:', e);
  }
  res.status(401).json({ message: 'Invalid credentials' });
});

publicRouter.post('/login/pin', async (req, res) => {
  const { pin } = req.body;
  if (!pin) {
    return res.status(400).json({ message: 'PIN is required' });
  }

  try {
    const userResult = await pool.query(
      `SELECT u.id, u.username, u.display_name, u.role, r.name as restaurant_name
       FROM users u
       LEFT JOIN restaurants r ON r.id = u.restaurant_id
       WHERE u.pin = $1`,
      [pin]
    );
    if (userResult.rows.length > 0) {
      const userObj = userResult.rows[0];
      return res.json({
        success: true,
        user: {
          id: userObj.id,
          name: userObj.display_name,
          role: userObj.role.toLowerCase(),
          email: userObj.username, // Using username as a fallback
          restaurantName: userObj.restaurant_name || 'BhojAI'
        }
      });
    }
  } catch (e) {
    console.error('PIN Login database query error:', e);
  }
  res.status(401).json({ message: 'Invalid PIN' });
});

// Helper to audit/log session events
async function logSessionEvent(client: any, sessionId: string, eventType: string, metadata: any, channel: string) {
  await client.query(
    `INSERT INTO session_events (session_id, event_type, timestamp, metadata, source_device, source_channel)
     VALUES ($1, $2, NOW(), $3, 'CUSTOMER_MOBILE', $4)`,
    [sessionId, eventType, JSON.stringify(metadata), channel]
  );
}

// 1. GET /api/public/tables/:tableId — Retrieve table details (includes zone for dynamic pricing)
publicRouter.get('/tables/:tableId', async (req, res) => {
  const { tableId } = req.params;
  try {
    const result = await pool.query(
      `SELECT t.table_id, t.table_number, t.status, t.occupied_since, t.active_item_count, t.is_bill_paid,
              t.zone_id,
              dz.name as zone_name,
              r.name as restaurant_name
       FROM tables t
       JOIN restaurants r ON r.id = t.restaurant_id
       LEFT JOIN dining_zones dz ON dz.zone_id = t.zone_id
       WHERE t.table_id = $1`,
      [tableId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Table not found' });
    }
    const table = result.rows[0];

    const client = await pool.connect();
    let sessionState;
    try {
      sessionState = await fetchSessionState(client, tableId);
    } finally {
      client.release();
    }

    const visualState = deriveTableVisualState(sessionState);

    res.json({
      ...table,
      visual_state: visualState,
      active_session_id: sessionState.session_id,
      session_status: sessionState.session_status,
      payment_status: sessionState.payment_status,
    });
  } catch (err: any) {
    console.error('GET /public/tables/:tableId error:', err);
    res.status(500).json({ message: 'Failed to fetch table details' });
  }
});

// 2. GET /api/public/categories — List active categories for the scanned restaurant
publicRouter.get('/categories', async (req, res) => {
  const { tableId } = req.query as { tableId?: string };
  try {
    let restaurantId: number = 1;
    if (tableId) {
      const tableRes = await pool.query(
        `SELECT restaurant_id FROM tables WHERE table_id = $1 LIMIT 1`,
        [tableId]
      );
      if (tableRes.rows.length > 0) {
        restaurantId = tableRes.rows[0].restaurant_id;
      }
    }
    const result = await pool.query(
      `SELECT id, name, is_active FROM categories
       WHERE is_active = true AND restaurant_id = $1
       ORDER BY name`,
      [restaurantId]
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /public/categories error:', err);
    res.status(500).json({ message: 'Failed to fetch categories' });
  }
});

// 3. GET /api/public/items — List active menu items with dynamic pricing
// Price resolution: zone override (via table) > time-of-day schedule > base price
publicRouter.get('/items', async (req, res) => {
  const { tableId } = req.query as { tableId?: string };
  try {
    let restaurantId: number = 1;
    let zoneId: string | null = null;

    if (tableId) {
      const tableRes = await pool.query(
        `SELECT restaurant_id, zone_id FROM tables WHERE table_id = $1 LIMIT 1`,
        [tableId]
      );
      if (tableRes.rows.length > 0) {
        restaurantId = tableRes.rows[0].restaurant_id;
        zoneId = tableRes.rows[0].zone_id ?? null;
      }
    }

    // Resolve current active schedule (if any) based on server time + day-of-week
    const scheduleResult = await pool.query(
      `SELECT schedule_id FROM menu_schedules
       WHERE is_active = true
         AND restaurant_id = $1
         AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::time BETWEEN start_time AND end_time
         AND EXTRACT(DOW FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata'))::integer = ANY(days_of_week)
       LIMIT 1`,
      [restaurantId]
    );
    const activeScheduleId: string | null = scheduleResult.rows[0]?.schedule_id ?? null;

    const result = await pool.query(
      `SELECT i.id, i.serial_number, i.name, i.selling_price, i.category,
              i.stock_quantity, i.is_active, i.stock_type, i.image_url,
              i.customizable_options, i.is_veg,
              gc.gst_percentage as gst_rate,
              -- Price resolution: zone > schedule > base
              COALESCE(
                CASE WHEN $2::uuid IS NOT NULL THEN izp.price ELSE NULL END,
                CASE WHEN $3::uuid IS NOT NULL THEN isp.price ELSE NULL END,
                i.selling_price
              ) as effective_price,
              COALESCE(
                (
                  SELECT json_agg(json_build_object('id', ia.id, 'name', ia.name, 'price', ia.price, 'is_active', ia.is_active))
                  FROM item_addons ia
                  WHERE ia.item_id = i.id AND ia.is_active = true
                ),
                '[]'::json
              ) as addons
       FROM items i
       LEFT JOIN gst_config gc
         ON gc.category = i.category
        AND gc.restaurant_id = i.restaurant_id
       LEFT JOIN item_zone_prices izp
         ON izp.item_id = i.id AND izp.zone_id = $2::uuid
       LEFT JOIN item_schedule_prices isp
         ON isp.item_id = i.id AND isp.schedule_id = $3::uuid
       WHERE i.is_active = true
         AND i.restaurant_id = $1
       ORDER BY i.category, i.name`,
      [restaurantId, zoneId, activeScheduleId]
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /public/items error:', err);
    res.status(500).json({ message: 'Failed to fetch items' });
  }
});

// 4. POST /api/public/tables/:tableId/orders — Place customer order
publicRouter.post('/tables/:tableId/orders', async (req, res) => {
  const { tableId } = req.params;
  const { items, order_type, orderType, payment_option, paymentOption, special_instructions, specialInstructions, notes } = req.body;

  // DEBUG LOG — remove after confirming fix
  console.log('[ORDER] Received body keys:', Object.keys(req.body));
  console.log('[ORDER] order_type:', order_type, '| orderType:', orderType);
  console.log('[ORDER] payment_option:', payment_option, '| paymentOption:', paymentOption);
  console.log('[ORDER] notes:', notes, '| specialInstructions:', specialInstructions);

  const orderTypeVal = order_type || orderType || 'Dine In';
  const paymentOptionVal = payment_option || paymentOption || 'Pay at Restaurant';
  const specialInstructionsVal = special_instructions || specialInstructions || notes || null;

  console.log('[ORDER] Resolved → orderTypeVal:', orderTypeVal, '| paymentOptionVal:', paymentOptionVal, '| notes:', specialInstructionsVal);

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'items array is required and cannot be empty' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check table exists
    const tableCheck = await client.query(
      `SELECT table_id, table_number, status, zone_id, restaurant_id FROM tables WHERE table_id = $1 FOR UPDATE`,
      [tableId]
    );
    if (tableCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Table not found' });
    }
    const table = tableCheck.rows[0];
    const currentStatus = table.status;
    const zoneId = table.zone_id ?? null;
    const restaurantId = table.restaurant_id ?? 1;

    // Resolve active schedule for dynamic pricing
    const scheduleResult = await client.query(
      `SELECT schedule_id FROM menu_schedules
       WHERE is_active = true
         AND restaurant_id = $1
         AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::time BETWEEN start_time AND end_time
         AND EXTRACT(DOW FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata'))::integer = ANY(days_of_week)
       LIMIT 1`,
      [restaurantId]
    );
    const activeScheduleId = scheduleResult.rows[0]?.schedule_id ?? null;

    // Find or create active table session
    const sessionQuery = await client.query(
      `SELECT ts.session_id, ts.is_payment_locked, ts.status
       FROM table_sessions ts
       LEFT JOIN session_tables st ON ts.session_id = st.session_id
       WHERE (ts.table_id = $1 OR st.table_id = $1)
         AND ts.status IN ('active', 'billed', 'payment_pending', 'payment_done', 'waiting_service_completion', 'ready_to_close')
       LIMIT 1 FOR UPDATE OF ts`,
      [tableId]
    );

    let finalSessionId: string;
    let isNewSession = false;

    if (sessionQuery.rows.length > 0) {
      const activeSession = sessionQuery.rows[0];
      if (activeSession.is_payment_locked) {
        await client.query('ROLLBACK');
        return res.status(422).json({
          message: 'This table session is currently locked for payment. No new orders can be placed.'
        });
      }

      finalSessionId = activeSession.session_id;

      // Reopen session if it was billed
      if (activeSession.status === 'billed' || activeSession.status === 'payment_pending') {
        await client.query(
          `UPDATE table_sessions
           SET status = 'active', last_activity_at = NOW(), version = version + 1
           WHERE session_id = $1`,
          [finalSessionId]
        );
        await logSessionEvent(client, finalSessionId, 'SESSION_REOPENED', { previous_status: activeSession.status, reason: 'Customer placed new order' }, 'CUSTOMER_QR');
      }
    } else {
      // Auto-start a new session
      isNewSession = true;
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomHex = randomBytes(3).toString('hex').toUpperCase();
      const sessionCode = `SESS-T${table.table_number}-${dateStr}-${randomHex}`;

      const newSessionResult = await client.query(
        `INSERT INTO table_sessions (
           table_id, session_code, status, guest_count, started_at,
           payment_status, is_payment_locked, is_force_closed, source_type, version
         ) VALUES ($1, $2, 'active', 1, NOW(), 'unpaid', false, false, 'CUSTOMER_QR', 1)
         RETURNING session_id`,
        [tableId, sessionCode]
      );
      finalSessionId = newSessionResult.rows[0].session_id;

      await client.query(
        `INSERT INTO session_tables (session_id, table_id) VALUES ($1, $2)`,
        [finalSessionId, tableId]
      );

      await logSessionEvent(client, finalSessionId, 'SESSION_STARTED', { table_number: table.table_number, note: 'Started by customer QR scan order' }, 'CUSTOMER_QR');
    }

    // Determine order phase
    const phaseResult = await client.query(
      `SELECT COALESCE(MAX(order_phase), 0) + 1 as next_phase FROM orders WHERE table_id = $1`,
      [tableId]
    );
    const orderPhase = phaseResult.rows[0].next_phase;

    // Create order
    const orderResult = await client.query(
      `INSERT INTO orders (table_id, order_phase, status, session_id, source_type, order_type, payment_option, notes)
       VALUES ($1, $2, 'open', $3, 'CUSTOMER_QR', $4, $5, $6)
       RETURNING order_id, table_id, order_phase, status, created_at, session_id, order_type, payment_option, notes`,
      [tableId, orderPhase, finalSessionId, orderTypeVal, paymentOptionVal, specialInstructionsVal]
    );
    const newOrder = orderResult.rows[0];

    // Insert items
    const orderItems = await Promise.all(
      items.map(async (item: any) => {
        const itemData = await client.query(
          `SELECT i.id, i.name, 
                  COALESCE(
                    CASE WHEN $2::uuid IS NOT NULL THEN izp.price ELSE NULL END,
                    CASE WHEN $3::uuid IS NOT NULL THEN isp.price ELSE NULL END,
                    i.selling_price
                  ) as effective_price
           FROM items i
           LEFT JOIN item_zone_prices izp ON izp.item_id = i.id AND izp.zone_id = $2::uuid
           LEFT JOIN item_schedule_prices isp ON isp.item_id = i.id AND isp.schedule_id = $3::uuid
           WHERE i.id = $1`,
          [item.id || item.item_id, zoneId, activeScheduleId]
        );
        if (itemData.rows.length === 0) throw new Error(`Item ${item.id || item.item_id} not found`);
        const dbItem = itemData.rows[0];

        // Fetch active addons for the item
        const addonsData = await client.query(
          `SELECT name, price FROM item_addons WHERE item_id = $1 AND is_active = true`,
          [dbItem.id]
        );
        
        const selectedExtras = Array.isArray(item.extras) ? item.extras : [];
        const selectedSpiceLevel = item.spiceLevel || item.spice_level || null;

        let addonPriceSum = 0;
        selectedExtras.forEach((extraName: string) => {
          const addon = addonsData.rows.find(a => a.name === extraName);
          if (addon) {
            addonPriceSum += Number(addon.price);
          }
        });
        const finalPriceAtBilling = Number(dbItem.effective_price) + addonPriceSum;

        const itemResult = await client.query(
          `INSERT INTO order_items (order_id, item_id, quantity, price_at_billing, gst_percent_at_billing, extras, spice_level)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING order_item_id, item_id, quantity, price_at_billing, extras, spice_level`,
          [newOrder.order_id, dbItem.id, item.quantity || 1, finalPriceAtBilling, item.gstRate || 5, selectedExtras, selectedSpiceLevel]
        );
        return { ...itemResult.rows[0], item_name: dbItem.name };
      })
    );

    // Link active_order_id in session
    await client.query(
      `UPDATE table_sessions
       SET active_order_id = $1, last_activity_at = NOW(), version = version + 1
       WHERE session_id = $2`,
      [newOrder.order_id, finalSessionId]
    );

    // Update table status
    const newTableStatus =
      currentStatus === 'waiting_for_service_completion' ||
      currentStatus === 'ready_to_free' ||
      currentStatus === 'billing_done'
        ? 'waiting_for_service_completion'
        : 'occupied';

    await client.query(
      `UPDATE tables
       SET status = $1, occupied_since = COALESCE(occupied_since, NOW())
       WHERE table_id = $2`,
      [newTableStatus, tableId]
    );

    // AUTO-GENERATE KOT FOR CUSTOMER ORDERS
    const { parentKot, sectionKots } = await generateKotForOrder(client, newOrder.order_id);

    await client.query('COMMIT');

    res.status(201).json({ ...newOrder, items: orderItems, parentKot, sectionKots });

    // Trigger WebSocket broadcast
    broadcastToAdmins({
      type: 'ORDER_PLACED',
      tableId,
      tableNumber: table.table_number,
      orderId: newOrder.order_id,
      sessionId: finalSessionId,
      timestamp: new Date().toISOString(),
      kotNumber: parentKot.kot_number
    });

    // Notify the kitchen specifically (if broadcaster supports dynamic type-check, otherwise general is fine)
    broadcastToAdmins({
      type: 'KOT_GENERATED',
      tableId,
      kotId: parentKot.kot_id,
      kotNumber: parentKot.kot_number,
      sectionKots: sectionKots.length
    });

  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('POST /public/tables/:tableId/orders error:', err);
    res.status(500).json({ message: err.message || 'Failed to place order' });
  } finally {
    client.release();
  }
});

// 5. GET /api/public/tables/:tableId/orders — List active orders for the current session
publicRouter.get('/tables/:tableId/orders', async (req, res) => {
  const { tableId } = req.params;
  const client = await pool.connect();
  try {
    // Find active session
    const sessionQuery = await client.query(
      `SELECT ts.session_id FROM table_sessions ts
       LEFT JOIN session_tables st ON ts.session_id = st.session_id
       WHERE (ts.table_id = $1 OR st.table_id = $1)
         AND ts.status IN ('active', 'billed', 'payment_pending', 'payment_done', 'waiting_service_completion', 'ready_to_close')
       LIMIT 1`,
      [tableId]
    );

    if (sessionQuery.rows.length === 0) {
      return res.json({ orders: [], active_session_id: null, order_count: 0 });
    }

    const activeSessionId = sessionQuery.rows[0].session_id;

    // Fetch orders in active session
    const ordersResult = await client.query(
      `SELECT
         o.order_id, o.table_id, o.order_phase, o.status AS order_status,
         COALESCE(kot_state.display_status, o.status::text) AS status,
         o.created_at, o.session_id
       FROM orders o
       LEFT JOIN LATERAL (
         SELECT
           CASE
             WHEN COUNT(k.kot_id) = 0 THEN NULL
             WHEN BOOL_AND(k.status = 'completed') THEN 'completed'
             WHEN BOOL_OR(k.status = 'ready') THEN 'ready'
             WHEN BOOL_OR(k.status = 'acknowledged') THEN 'preparing'
             WHEN BOOL_OR(k.status = 'pending') THEN 'sent_to_kitchen'
             ELSE MAX(k.status::text)
           END AS display_status
         FROM kots k
         WHERE k.order_id = o.order_id
       ) kot_state ON TRUE
       WHERE o.session_id = $1
       ORDER BY o.order_phase DESC`,
      [activeSessionId]
    );

    const orders = await Promise.all(
      ordersResult.rows.map(async (order: any) => {
        const itemsResult = await client.query(
          `SELECT oi.order_item_id, oi.item_id, i.name as item_name,
                  oi.quantity, oi.price_at_billing, oi.gst_percent_at_billing,
                  oi.extras, oi.spice_level,
                  COALESCE(ki.status, 'pending') as item_status
           FROM order_items oi
           LEFT JOIN items i ON i.id = oi.item_id
           LEFT JOIN orders o ON o.order_id = oi.order_id
           LEFT JOIN kots k ON k.order_id = o.order_id
           LEFT JOIN kot_items ki ON ki.kot_id = k.kot_id AND ki.item_id = oi.item_id
           WHERE oi.order_id = $1`,
          [order.order_id]
        );
        return { ...order, items: itemsResult.rows };
      })
    );

    res.json({
      orders,
      active_session_id: activeSessionId,
      order_count: orders.length
    });

  } catch (err: any) {
    console.error('GET /public/tables/:tableId/orders error:', err);
    res.status(500).json({ message: 'Failed to fetch customer session orders' });
  } finally {
    client.release();
  }
});

// 6. POST /api/public/tables/:tableId/call-waiter — Call Waiter
publicRouter.post('/tables/:tableId/call-waiter', async (req, res) => {
  const { tableId } = req.params;
  const { requestType } = req.body; // optional note e.g. "More Water", "Extra Plates", "Tissue"

  const client = await pool.connect();
  try {
    const tableCheck = await client.query(
      `SELECT table_number FROM tables WHERE table_id = $1`,
      [tableId]
    );
    if (tableCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Table not found' });
    }
    const tableNumber = tableCheck.rows[0].table_number;

    const sessionQuery = await client.query(
      `SELECT session_id FROM table_sessions
       WHERE table_id = $1
         AND status IN ('active', 'billed', 'payment_pending', 'payment_done', 'waiting_service_completion', 'ready_to_close')
       LIMIT 1`,
      [tableId]
    );

    let sessionId = null;
    if (sessionQuery.rows.length > 0) {
      sessionId = sessionQuery.rows[0].session_id;
      await logSessionEvent(client, sessionId, 'WAITER_CALL', { request_type: requestType || 'General assistance' }, 'CUSTOMER_QR');
    }

    res.json({ message: 'Waiter call received. Assistance is on the way.' });

    // Trigger WebSocket broadcast
    broadcastToAdmins({
      type: 'CALL_WAITER',
      tableId,
      tableNumber,
      sessionId,
      requestType: requestType || 'Waiter Service Required',
      timestamp: new Date().toISOString()
    });

  } catch (err: any) {
    console.error('POST /public/tables/:tableId/call-waiter error:', err);
    res.status(500).json({ message: 'Failed to process waiter call' });
  } finally {
    client.release();
  }
});

// 7. POST /api/public/tables/:tableId/request-bill — Request Bill
publicRouter.post('/tables/:tableId/request-bill', async (req, res) => {
  const { tableId } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tableCheck = await client.query(
      `SELECT table_number FROM tables WHERE table_id = $1`,
      [tableId]
    );
    if (tableCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Table not found' });
    }
    const tableNumber = tableCheck.rows[0].table_number;

    const sessionQuery = await client.query(
      `SELECT session_id, status FROM table_sessions
       WHERE table_id = $1
         AND status IN ('active', 'billed', 'payment_pending', 'payment_done', 'waiting_service_completion', 'ready_to_close')
       LIMIT 1 FOR UPDATE`,
      [tableId]
    );

    if (sessionQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'No active session on this table to generate a bill for.' });
    }

    const sessionId = sessionQuery.rows[0].session_id;

    await logSessionEvent(client, sessionId, 'BILL_REQUESTED', { reason: 'Requested by customer QR checkout' }, 'CUSTOMER_QR');

    await client.query('COMMIT');

    res.json({
      message: 'Bill requested. Our staff will process your bill shortly.',
      sessionId
    });

    // Trigger WebSocket broadcast to POS Admins
    broadcastToAdmins({
      type: 'REQUEST_BILL',
      tableId,
      tableNumber,
      sessionId,
      timestamp: new Date().toISOString()
    });

  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('POST /public/tables/:tableId/request-bill error:', err);
    res.status(500).json({ message: 'Failed to request bill' });
  } finally {
    client.release();
  }
});

// 8. POST /api/public/tables/:tableId/reviews — Submit Customer Review
publicRouter.post('/tables/:tableId/reviews', async (req, res) => {
  const { tableId } = req.params;
  const { rating, feedback, foodRating, serviceRating, ambienceRating, quickTags } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'A valid rating between 1 and 5 is required.' });
  }

  const client = await pool.connect();
  try {
    // Check if table exists
    const tableCheck = await client.query(
      `SELECT restaurant_id FROM tables WHERE table_id = $1`,
      [tableId]
    );
    if (tableCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Table not found' });
    }
    const restaurantId = tableCheck.rows[0].restaurant_id;

    // Find the most recent session for this table
    const sessionQuery = await client.query(
      `SELECT session_id FROM table_sessions
       WHERE table_id = $1
       ORDER BY started_at DESC
       LIMIT 1`,
      [tableId]
    );

    let sessionId = null;
    if (sessionQuery.rows.length > 0) {
      sessionId = sessionQuery.rows[0].session_id;
    }

    // Insert the review
    const reviewResult = await client.query(
      `INSERT INTO customer_reviews (session_id, restaurant_id, rating, food_rating, service_rating, ambience_rating, quick_tags, feedback)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, session_id, rating, feedback, created_at`,
      [sessionId, restaurantId, rating, foodRating || null, serviceRating || null, ambienceRating || null, JSON.stringify(quickTags || []), feedback || null]
    );

    res.status(201).json({
      message: 'Review submitted successfully',
      review: reviewResult.rows[0]
    });

  } catch (err: any) {
    console.error('POST /public/tables/:tableId/reviews error:', err);
    res.status(500).json({ message: 'Failed to submit review' });
  } finally {
    client.release();
  }
});
