import { Router } from 'express';
import { pool } from '../db';
import { generateKotForOrder } from './kot-utils';
import { broadcastToAdmins } from '../websocket';

export const ordersRouter = Router();

// GET /orders - list all orders with items
ordersRouter.get('/', async (req, res) => {
  try {
    const ordersResult = await pool.query(
      `SELECT o.order_id, o.table_id, t.table_number, o.order_phase, o.status, o.created_at,
              o.order_type, o.payment_option, o.notes
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
      `SELECT o.order_id, o.table_id, t.table_number, o.order_phase, o.status, o.created_at,
              o.order_type, o.payment_option, o.notes
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

    const { parentKot, sectionKots } = await generateKotForOrder(client, orderId);

    await client.query('COMMIT');

    // Broadcast to kitchen display — same as public (QR) order flow
    try {
      broadcastToAdmins({
        type: 'KOT_GENERATED',
        orderId,
        kotId: parentKot.kot_id,
        kotNumber: parentKot.kot_number,
        tableNumber: parentKot.table_number,
        orderType: parentKot.order_type,
        sections: sectionKots.map((sk: any) => sk.section_name),
      });
    } catch (broadcastErr: any) {
      console.warn('[send-to-kitchen] KOT_GENERATED broadcast error (non-fatal):', broadcastErr.message);
    }

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
