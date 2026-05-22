import { Router } from 'express';
import { pool } from '../db';
import {
  canFreeTable,
  tryAutoFreeTable,
  auditLog,
  deriveTableStatus,
} from './table-management';

export const tablesRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /tables — list all tables with live status summary
// ─────────────────────────────────────────────────────────────────────────────
tablesRouter.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         t.table_id, t.table_number, t.status,
         t.is_bill_paid, t.occupied_since, t.active_item_count,
         t.created_at,
         -- item counts per table for UI status summary
         COUNT(ski.section_kot_item_id) FILTER (WHERE ski.status = 'pending')   AS pending_count,
         COUNT(ski.section_kot_item_id) FILTER (WHERE ski.status = 'preparing') AS preparing_count,
         COUNT(ski.section_kot_item_id) FILTER (WHERE ski.status = 'ready')     AS ready_count,
         COUNT(DISTINCT b.id)           FILTER (WHERE b.payment_status = 'paid')   AS paid_bills,
         COUNT(DISTINCT b.id)           FILTER (WHERE b.payment_status = 'unpaid') AS unpaid_bills
       FROM tables t
       LEFT JOIN kots k               ON k.table_id        = t.table_id
       LEFT JOIN section_kots sk      ON sk.parent_kot_id  = k.kot_id
       LEFT JOIN section_kot_items ski ON ski.section_kot_id = sk.section_kot_id
       LEFT JOIN bills b              ON b.table_id        = t.table_id
       GROUP BY t.table_id
       ORDER BY t.table_number`
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /tables error:', err);
    res.status(500).json({ message: 'Failed to fetch tables' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /tables/:tableId — single table with live counts
// ─────────────────────────────────────────────────────────────────────────────
tablesRouter.get('/:tableId', async (req, res) => {
  const { tableId } = req.params;
  try {
    const result = await pool.query(
      `SELECT
         t.table_id, t.table_number, t.status,
         t.is_bill_paid, t.occupied_since, t.active_item_count, t.created_at,
         COUNT(ski.section_kot_item_id) FILTER (WHERE ski.status = 'pending')   AS pending_count,
         COUNT(ski.section_kot_item_id) FILTER (WHERE ski.status = 'preparing') AS preparing_count,
         COUNT(ski.section_kot_item_id) FILTER (WHERE ski.status = 'ready')     AS ready_count,
         COUNT(DISTINCT b.id)           FILTER (WHERE b.payment_status = 'paid')   AS paid_bills,
         COUNT(DISTINCT b.id)           FILTER (WHERE b.payment_status = 'unpaid') AS unpaid_bills
       FROM tables t
       LEFT JOIN kots k                ON k.table_id         = t.table_id
       LEFT JOIN section_kots sk       ON sk.parent_kot_id   = k.kot_id
       LEFT JOIN section_kot_items ski ON ski.section_kot_id = sk.section_kot_id
       LEFT JOIN bills b               ON b.table_id         = t.table_id
       WHERE t.table_id = $1
       GROUP BY t.table_id`,
      [tableId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Table not found' });
    res.json(result.rows[0]);
  } catch (err: any) {
    console.error('GET /tables/:tableId error:', err);
    res.status(500).json({ message: 'Failed to fetch table' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /tables — create table
// ─────────────────────────────────────────────────────────────────────────────
tablesRouter.post('/', async (req, res) => {
  const { table_number } = req.body;
  if (!table_number) return res.status(400).json({ message: 'table_number is required' });
  try {
    const result = await pool.query(
      `INSERT INTO tables (table_number) VALUES ($1)
       RETURNING table_id, table_number, status, created_at`,
      [table_number]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ message: 'Table number already exists' });
    console.error('POST /tables error:', err);
    res.status(500).json({ message: 'Failed to create table' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /tables/:tableId — delete table
// ─────────────────────────────────────────────────────────────────────────────
tablesRouter.delete('/:tableId', async (req, res) => {
  const { tableId } = req.params;
  try {
    const existing = await pool.query(`SELECT status FROM tables WHERE table_id = $1`, [tableId]);
    if (existing.rows.length === 0) return res.status(404).json({ message: 'Table not found' });
    if (existing.rows[0].status !== 'free')
      return res.status(400).json({ message: 'Cannot delete a non-free table' });

    await pool.query(`DELETE FROM tables WHERE table_id = $1`, [tableId]);
    res.json({ message: 'Table deleted successfully' });
  } catch (err: any) {
    console.error('DELETE /tables/:tableId error:', err);
    res.status(500).json({ message: 'Failed to delete table' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /tables/:tableId/can-free — dry-run validation (read-only)
// ─────────────────────────────────────────────────────────────────────────────
tablesRouter.get('/:tableId/can-free', async (req, res) => {
  const { tableId } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const validation = await canFreeTable(client, tableId);
    await client.query('ROLLBACK'); // read-only, no changes
    res.json(validation);
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('GET /tables/:tableId/can-free error:', err);
    res.status(500).json({ message: 'Validation failed' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /tables/:tableId/free — attempt to free table (validated)
//
// RULE: Payment must NOT auto-free the table.
// Only use this endpoint when staff explicitly triggers table release.
// The system validates all conditions atomically before freeing.
// ─────────────────────────────────────────────────────────────────────────────
tablesRouter.post('/:tableId/free', async (req, res) => {
  const { tableId } = req.params;
  const userId = req.body.user_id ?? null;

  try {
    const { freed, newStatus, validation } = await tryAutoFreeTable(pool, tableId, `user:${userId}`);

    if (!freed) {
      return res.status(422).json({
        message: validation.reason,
        canFree: false,
        tableStatus: newStatus,
        validation,
      });
    }

    await auditLog(pool, 'TABLE_FREED', {
      entityType: 'table',
      entityId: tableId,
      tableId,
      userId,
      reason: 'Manual free by staff',
      metadata: { validation },
    });

    res.json({
      message: 'Table freed successfully.',
      canFree: true,
      tableStatus: newStatus,
      validation,
    });
  } catch (err: any) {
    console.error('POST /tables/:tableId/free error:', err);
    res.status(500).json({ message: 'Failed to free table' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /tables/:tableId/force-free — ADMIN ONLY force free (EC-8)
//
// Bypasses all validation. Requires:
//   - admin permission (x-role: ADMIN header — enforced by global middleware)
//   - mandatory reason in body
//   - full audit log entry
// ─────────────────────────────────────────────────────────────────────────────
tablesRouter.post('/:tableId/force-free', async (req, res) => {
  const { tableId } = req.params;
  const { reason, user_id } = req.body;

  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    return res.status(400).json({ message: 'reason is required for force-free.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock and fetch current state for audit
    const tableRow = await client.query(
      `SELECT table_id, table_number, status FROM tables WHERE table_id = $1 FOR UPDATE`,
      [tableId]
    );
    if (tableRow.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Table not found' });
    }

    const prevStatus = tableRow.rows[0].status;

    // Snapshot validation state for audit (do NOT block on it)
    const validation = await canFreeTable(client, tableId);

    // Force-free: bypass all checks
    await client.query(
      `UPDATE tables
       SET status = 'free',
           is_bill_paid = false,
           active_item_count = 0,
           occupied_since = NULL
       WHERE table_id = $1`,
      [tableId]
    );

    await auditLog(client, 'FORCE_FREE_TABLE', {
      entityType: 'table',
      entityId: tableId,
      tableId,
      userId: user_id ?? null,
      reason: reason.trim(),
      metadata: {
        previousStatus: prevStatus,
        tableNumber: tableRow.rows[0].table_number,
        validationSnapshot: validation,
      },
    });

    await client.query('COMMIT');

    res.json({
      message: `Table force-freed successfully. Previous status: ${prevStatus}.`,
      tableStatus: 'free',
      warning: 'This was an admin override. All validation was bypassed.',
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('POST /tables/:tableId/force-free error:', err);
    res.status(500).json({ message: 'Failed to force-free table' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /tables/:tableId/audit — get audit trail for a table
// ─────────────────────────────────────────────────────────────────────────────
tablesRouter.get('/:tableId/audit', async (req, res) => {
  const { tableId } = req.params;
  const limit = Math.min(parseInt((req.query.limit as string) ?? '50', 10), 200);
  try {
    const result = await pool.query(
      `SELECT audit_id, action, entity_type, entity_id, user_id,
              reason, metadata, created_at
       FROM audit_log
       WHERE table_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [tableId, limit]
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /tables/:tableId/audit error:', err);
    res.status(500).json({ message: 'Failed to fetch audit log' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /tables/:tableId/orders — all orders for a table
// ─────────────────────────────────────────────────────────────────────────────
tablesRouter.get('/:tableId/orders', async (req, res) => {
  const { tableId } = req.params;
  try {
    const ordersResult = await pool.query(
      `SELECT o.order_id, o.table_id, o.order_phase, o.status, o.created_at
       FROM orders o WHERE o.table_id = $1 ORDER BY o.order_phase`,
      [tableId]
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
    console.error('GET /tables/:tableId/orders error:', err);
    res.status(500).json({ message: 'Failed to fetch table orders' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /tables/:tableId/orders — create order for a table
// ─────────────────────────────────────────────────────────────────────────────
tablesRouter.post('/:tableId/orders', async (req, res) => {
  const { tableId } = req.params;
  const { items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'items array is required and cannot be empty' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tableCheck = await client.query(
      `SELECT table_id, status FROM tables WHERE table_id = $1`,
      [tableId]
    );
    if (tableCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Table not found' });
    }

    // EC-10: Allow new orders even after billing (re-open workflow)
    const currentStatus = tableCheck.rows[0].status;

    const phaseResult = await client.query(
      `SELECT COALESCE(MAX(order_phase), 0) + 1 as next_phase FROM orders WHERE table_id = $1`,
      [tableId]
    );
    const orderPhase = phaseResult.rows[0].next_phase;

    const orderResult = await client.query(
      `INSERT INTO orders (table_id, order_phase, status)
       VALUES ($1, $2, 'open') RETURNING order_id, table_id, order_phase, status, created_at`,
      [tableId, orderPhase]
    );
    const newOrder = orderResult.rows[0];

    const orderItems = await Promise.all(
      items.map(async (item: any) => {
        const itemData = await client.query(
          `SELECT id, name, selling_price FROM items WHERE id = $1`,
          [item.id || item.item_id]
        );
        if (itemData.rows.length === 0) throw new Error(`Item ${item.id || item.item_id} not found`);
        const dbItem = itemData.rows[0];

        const itemResult = await client.query(
          `INSERT INTO order_items (order_id, item_id, quantity, price_at_billing, gst_percent_at_billing)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING order_item_id, item_id, quantity, price_at_billing`,
          [newOrder.order_id, dbItem.id, item.quantity || 1, dbItem.selling_price, item.gstRate || 5]
        );
        return { ...itemResult.rows[0], item_name: dbItem.name };
      })
    );

    // Mark table occupied; if it was ready_to_free (EC-10: late KOT after billing), revert
    const newTableStatus =
      currentStatus === 'waiting_for_service_completion' ||
      currentStatus === 'ready_to_free' ||
      currentStatus === 'billing_done'
        ? 'waiting_for_service_completion'
        : 'occupied';

    await client.query(
      `UPDATE tables
       SET status = $1,
           occupied_since = COALESCE(occupied_since, NOW())
       WHERE table_id = $2`,
      [newTableStatus, tableId]
    );

    // Audit if late KOT added after billing
    if (['billing_done', 'waiting_for_service_completion', 'ready_to_free'].includes(currentStatus)) {
      await auditLog(client, 'LATE_KOT_ADDED', {
        entityType: 'order',
        entityId: newOrder.order_id,
        tableId,
        reason: 'New order added after bill was generated',
        metadata: { previousStatus: currentStatus, orderPhase },
      });
    }

    await client.query('COMMIT');
    res.status(201).json({ ...newOrder, items: orderItems });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('POST /tables/:tableId/orders error:', err);
    res.status(500).json({ message: err.message || 'Failed to create order' });
  } finally {
    client.release();
  }
});
