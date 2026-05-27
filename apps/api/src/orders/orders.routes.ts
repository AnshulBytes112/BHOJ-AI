import { Router } from 'express';
import { pool } from '../db';

export const ordersRouter = Router();

function kitchenCode(sectionName: string): string {
  const compact = sectionName
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map(part => part[0])
    .join('')
    .toUpperCase();

  return (compact || 'GEN').slice(0, 6);
}

// GET /orders - list all orders with items
ordersRouter.get('/', async (req, res) => {
  try {
    const ordersResult = await pool.query(
      `SELECT o.order_id, o.table_id, t.table_number, o.order_phase, o.status, o.created_at
       FROM orders o
       LEFT JOIN tables t ON t.table_id = o.table_id
       ORDER BY o.created_at DESC`
    );

    const orders = await Promise.all(
      ordersResult.rows.map(async (order) => {
        const itemsResult = await pool.query(
          `SELECT oi.order_item_id, oi.item_id, i.name as item_name,
                  oi.quantity, oi.price_at_billing, oi.gst_percent_at_billing
           FROM order_items oi
           LEFT JOIN items i ON i.id = oi.item_id
           WHERE oi.order_id = $1`,
          [order.order_id]
        );
        return { ...order, items: itemsResult.rows };
      })
    );

    res.json(orders);
  } catch (err: any) {
    console.error('GET /orders error:', err);
    res.status(500).json({ message: 'Failed to fetch orders' });
  }
});

// GET /orders/:orderId - get single order with items
ordersRouter.get('/:orderId', async (req, res) => {
  const { orderId } = req.params;
  try {
    const orderResult = await pool.query(
      `SELECT o.order_id, o.table_id, t.table_number, o.order_phase, o.status, o.created_at
       FROM orders o
       LEFT JOIN tables t ON t.table_id = o.table_id
       WHERE o.order_id = $1`,
      [orderId]
    );
    if (orderResult.rows.length === 0) return res.status(404).json({ message: 'Order not found' });

    const itemsResult = await pool.query(
      `SELECT oi.order_item_id, oi.item_id, i.name as item_name,
              oi.quantity, oi.price_at_billing, oi.gst_percent_at_billing
       FROM order_items oi
       LEFT JOIN items i ON i.id = oi.item_id
       WHERE oi.order_id = $1`,
      [orderId]
    );

    res.json({ ...orderResult.rows[0], items: itemsResult.rows });
  } catch (err: any) {
    console.error('GET /orders/:orderId error:', err);
    res.status(500).json({ message: 'Failed to fetch order' });
  }
});

// POST /orders/:orderId/send-to-kitchen - send order to kitchen, generate KOTs
ordersRouter.post('/:orderId/send-to-kitchen', async (req, res) => {
  const { orderId } = req.params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `SELECT o.*, t.table_number FROM orders o
       LEFT JOIN tables t ON t.table_id = o.table_id
       WHERE o.order_id = $1`,
      [orderId]
    );
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found' });
    }

    const order = orderResult.rows[0];
    if (order.status !== 'open') {
      await client.query('ROLLBACK');
      return res.status(422).json({ message: 'Order already sent or billed' });
    }

    // Get items for this order
    const itemsResult = await client.query(
      `SELECT oi.order_item_id, oi.item_id, i.name as item_name, oi.quantity, oi.serial_number,
              i.category as section_name
       FROM order_items oi
       LEFT JOIN items i ON i.id = oi.item_id
       WHERE oi.order_id = $1`,
      [orderId]
    );

    if (itemsResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Cannot send empty order to kitchen' });
    }

    // Generate KOT number
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const kotCountResult = await client.query(
      `SELECT COUNT(*) as count FROM kots WHERE kot_number LIKE $1`,
      [`KOT-${dateStr}-%`]
    );
    const kotSeq = parseInt(kotCountResult.rows[0].count) + 1;
    const kotNumber = `KOT-${dateStr}-${String(kotSeq).padStart(3, '0')}`;

    // Create parent KOT
    const kotResult = await client.query(
      `INSERT INTO kots (order_id, table_id, table_number, order_phase, kot_number, status, session_id)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6)
       RETURNING *`,
      [orderId, order.table_id, order.table_number, order.order_phase, kotNumber, order.session_id]
    );
    const parentKot = kotResult.rows[0];

    // Insert KOT items
    for (const item of itemsResult.rows) {
      await client.query(
        `INSERT INTO kot_items (kot_id, item_id, item_name, quantity, serial_number)
         VALUES ($1, $2, $3, $4, $5)`,
        [parentKot.kot_id, item.item_id, item.item_name, item.quantity, item.serial_number]
      );
    }

    // Group items by section (from POS categories)
    const itemsBySection: Record<string, { sectionName: string; items: any[] }> = {};
    const unassignedItems: any[] = [];

    for (const item of itemsResult.rows) {
      const secName = item.section_name || 'General';
      if (!itemsBySection[secName]) {
        itemsBySection[secName] = { sectionName: secName, items: [] };
      }
      itemsBySection[secName].items.push(item);
    }

    // Create section KOTs from DB-driven mapping
    const sectionKots = [];
    let skSeq = 1;

    for (const [sectionName, { items }] of Object.entries(itemsBySection)) {
      const sectionKotNumber = `${kotNumber}-${kitchenCode(sectionName)}-${String(skSeq).padStart(2, '0')}`;
      skSeq++;

      const skotResult = await client.query(
        `INSERT INTO section_kots (parent_kot_id, section_id, section_name, section_kot_number, status)
         VALUES ($1, NULL, $2, $3, 'pending') RETURNING *`,
        [parentKot.kot_id, sectionName, sectionKotNumber]
      );
      const skot = skotResult.rows[0];

      for (const item of items) {
        await client.query(
          `INSERT INTO section_kot_items (section_kot_id, item_id, item_name, quantity, serial_number)
           VALUES ($1, $2, $3, $4, $5)`,
          [skot.section_kot_id, item.item_id, item.item_name, item.quantity, item.serial_number]
        );
      }
      sectionKots.push({
        ...skot,
        kitchen_name: sectionName,
        kitchen_kot_id: skot.section_kot_id,
        kitchen_kot_number: skot.section_kot_number,
        parent_kot_number: kotNumber,
        items,
      });
    }

    // Update order status
    await client.query(`UPDATE orders SET status = 'sent_to_kitchen' WHERE order_id = $1`, [orderId]);

    await client.query('COMMIT');

    res.json({
      message: 'Order sent to kitchen successfully',
      parentKot,
      sectionKots
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('POST /orders/:orderId/send-to-kitchen error:', err);
    res.status(500).json({ message: err.message || 'Failed to send order to kitchen' });
  } finally {
    client.release();
  }
});

// DELETE /orders/:orderId/items/:itemId - remove item from open order
ordersRouter.delete('/:orderId/items/:itemId', async (req, res) => {
  const { orderId, itemId } = req.params;
  try {
    const orderCheck = await pool.query(`SELECT status FROM orders WHERE order_id = $1`, [orderId]);
    if (orderCheck.rows.length === 0) return res.status(404).json({ message: 'Order not found' });
    if (orderCheck.rows[0].status !== 'open')
      return res.status(403).json({ message: 'Cannot edit sent orders' });

    await pool.query(
      `DELETE FROM order_items WHERE order_item_id = $1 AND order_id = $2`,
      [itemId, orderId]
    );
    res.json({ message: 'Item removed from order' });
  } catch (err: any) {
    console.error('DELETE /orders/:orderId/items/:itemId error:', err);
    res.status(500).json({ message: 'Failed to remove item' });
  }
});

// DELETE /orders/:orderId - cancel/delete an open order
ordersRouter.delete('/:orderId', async (req, res) => {
  const { orderId } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderCheck = await client.query(
      `SELECT table_id, status FROM orders WHERE order_id = $1`,
      [orderId]
    );
    if (orderCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found' });
    }

    const { table_id } = orderCheck.rows[0];
    await client.query(`DELETE FROM orders WHERE order_id = $1`, [orderId]);

    // If no more orders for this table, free the table
    const remaining = await client.query(
      `SELECT COUNT(*) as count FROM orders WHERE table_id = $1`,
      [table_id]
    );
    if (parseInt(remaining.rows[0].count) === 0) {
      await client.query(
        `UPDATE tables SET status = 'free', occupied_since = NULL, active_item_count = 0, is_bill_paid = false WHERE table_id = $1`,
        [table_id]
      );
      console.log(`[DELETE /orders/:orderId] Table ${table_id}: freed - status set to 'free', occupied_since set to NULL`);
    }

    await client.query('COMMIT');
    res.json({ message: 'Order cancelled' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('DELETE /orders/:orderId error:', err);
    res.status(500).json({ message: 'Failed to cancel order' });
  } finally {
    client.release();
  }
});
