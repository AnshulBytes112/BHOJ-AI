import { Router } from 'express';
import { randomBytes } from 'crypto';
import { pool } from '../db';
import { broadcastToAdmins, broadcastToTable } from '../websocket';
import { fetchSessionState, deriveTableVisualState } from '../tables/table-management';
import { generateKotForOrder } from '../orders/kot-utils';

export const publicRouter = Router();

// Helper to audit/log session events
async function logSessionEvent(client: any, sessionId: string, eventType: string, metadata: any, channel: string) {
  await client.query(
    `INSERT INTO session_events (session_id, event_type, timestamp, metadata, source_device, source_channel)
     VALUES ($1, $2, NOW(), $3, 'CUSTOMER_MOBILE', $4)`,
    [sessionId, eventType, JSON.stringify(metadata), channel]
  );
}

// 1. GET /api/public/tables/:tableId — Retrieve table details
publicRouter.get('/tables/:tableId', async (req, res) => {
  const { tableId } = req.params;
  try {
    const result = await pool.query(
      `SELECT table_id, table_number, status, occupied_since, active_item_count, is_bill_paid
       FROM tables WHERE table_id = $1`,
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

// 2. GET /api/public/categories — List active categories
publicRouter.get('/categories', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, is_active FROM categories WHERE is_active = true ORDER BY name`
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /public/categories error:', err);
    res.status(500).json({ message: 'Failed to fetch categories' });
  }
});

// 3. GET /api/public/items — List active menu items
publicRouter.get('/items', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT i.id, i.serial_number, i.name, i.selling_price, i.category,
              i.stock_quantity, i.is_active, i.stock_type, i.image_url,
              gc.gst_percentage as gst_rate,
              COALESCE(
                (
                  SELECT json_agg(json_build_object('id', ia.id, 'name', ia.name, 'price', ia.price, 'is_active', ia.is_active))
                  FROM item_addons ia
                  WHERE ia.item_id = i.id
                ),
                '[]'::json
              ) as addons
       FROM items i
       LEFT JOIN gst_config gc ON gc.category = i.category
       WHERE i.is_active = true
       ORDER BY i.name`
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
      `SELECT table_id, table_number, status FROM tables WHERE table_id = $1 FOR UPDATE`,
      [tableId]
    );
    if (tableCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Table not found' });
    }
    const table = tableCheck.rows[0];
    const currentStatus = table.status;

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
          `SELECT id, name, selling_price FROM items WHERE id = $1`,
          [item.id || item.item_id]
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
        const finalPriceAtBilling = Number(dbItem.selling_price) + addonPriceSum;

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

    // Transition session to 'billed'
    await client.query(
      `UPDATE table_sessions
       SET status = 'billed', last_activity_at = NOW(), version = version + 1
       WHERE session_id = $1`,
      [sessionId]
    );

    // Transition table status to 'billing_done'
    await client.query(
      `UPDATE tables SET status = 'billing_done' WHERE table_id = $1`,
      [tableId]
    );

    await logSessionEvent(client, sessionId, 'BILL_REQUESTED', { reason: 'Requested by customer QR checkout' }, 'CUSTOMER_QR');

    // Fetch session billing items to return in response
    const unbilledItems = await client.query(
      `SELECT oi.item_id, i.name as item_name, oi.quantity, oi.price_at_billing, oi.gst_percent_at_billing
       FROM order_items oi
       JOIN orders o ON o.order_id = oi.order_id
       JOIN items i ON i.id = oi.item_id
       WHERE o.session_id = $1`,
      [sessionId]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Bill requested. Our staff will present your receipt shortly.',
      items: unbilledItems.rows,
      sessionId
    });

    // Trigger WebSocket broadcast
    broadcastToAdmins({
      type: 'REQUEST_BILL',
      tableId,
      tableNumber,
      sessionId,
      timestamp: new Date().toISOString()
    });

    // Broadcast update to table client as well
    broadcastToTable(tableId, {
      type: 'BILL_STATUS_UPDATED',
      tableId,
      status: 'billed',
      sessionId
    });

  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('POST /public/tables/:tableId/request-bill error:', err);
    res.status(500).json({ message: 'Failed to request bill' });
  } finally {
    client.release();
  }
});
