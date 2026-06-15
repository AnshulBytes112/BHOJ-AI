import { Router } from 'express';
import { randomBytes } from 'crypto';
import { pool } from '../db';
import {
  canFreeTable,
  tryAutoFreeTable,
  auditLog,
  deriveTableStatus,
  fetchSessionState,
  deriveTableVisualState,
  ACTIVE_SESSION_STATUSES,
} from './table-management';

export const tablesRouter = Router();

async function generateQrToken(): Promise<string> {
  return randomBytes(18).toString('hex');
}

async function ensureActiveTableQr(client: any, tableId: string): Promise<{ qr_id: string; qr_token: string }> {
  const existing = await client.query(
    `SELECT qr_id, qr_token FROM table_qr WHERE table_id = $1 AND is_active = true LIMIT 1`,
    [tableId]
  );
  if (existing.rowCount > 0) {
    return existing.rows[0];
  }

  const qrToken = await generateQrToken();
  const created = await client.query(
    `INSERT INTO table_qr (table_id, qr_token, is_active)
     VALUES ($1, $2, true)
     RETURNING qr_id, qr_token`,
    [tableId, qrToken]
  );
  return created.rows[0];
}

// GET /tables — list all tables with live status summary and visual states
// ─────────────────────────────────────────────────────────────────────────────
tablesRouter.get('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT
         t.table_id, t.table_number, t.status,
         t.is_bill_paid, t.occupied_since, t.active_item_count,
         t.created_at,
         -- item counts per table for UI status summary (current session only)
         COUNT(ski.section_kot_item_id) FILTER (WHERE ski.status = 'pending')   AS pending_count,
         COUNT(ski.section_kot_item_id) FILTER (WHERE ski.status = 'preparing') AS preparing_count,
         COUNT(ski.section_kot_item_id) FILTER (WHERE ski.status = 'ready')     AS ready_count,
         COUNT(DISTINCT b.id)           FILTER (WHERE b.payment_status = 'paid')   AS paid_bills,
         COUNT(DISTINCT b.id)           FILTER (WHERE b.payment_status = 'unpaid') AS unpaid_bills,
         -- Active session info for this table
         ts.session_id,
         ts.status as session_status,
         ts.payment_status as session_payment_status
       FROM tables t
       LEFT JOIN kots k               ON k.table_id        = t.table_id
                                     AND (t.occupied_since IS NULL OR k.generated_at >= t.occupied_since)
       LEFT JOIN section_kots sk      ON sk.parent_kot_id  = k.kot_id
       LEFT JOIN section_kot_items ski ON ski.section_kot_id = sk.section_kot_id
       LEFT JOIN bills b              ON b.table_id        = t.table_id
                                     AND (t.occupied_since IS NULL OR b.created_at >= t.occupied_since)
       LEFT JOIN table_sessions ts    ON (ts.table_id = t.table_id OR t.table_id IN (
         SELECT st.table_id FROM session_tables st WHERE st.session_id = ts.session_id
       ))
                                     AND ts.status IN ('active', 'billed', 'payment_pending', 'payment_done', 'waiting_service_completion', 'ready_to_close')
       GROUP BY t.table_id, ts.session_id, ts.status, ts.payment_status
       ORDER BY t.table_number`
    );

    // Derive visual state for each table
    const tablesWithVisualState = await Promise.all(
      result.rows.map(async (row: { table_id: string }) => {
        await ensureActiveTableQr(client, row.table_id);
        const sessionState = await fetchSessionState(client, row.table_id);
        const visualState = deriveTableVisualState(sessionState);
        return {
          ...row,
          visual_state: visualState,
          active_session_id: sessionState.session_id,
        };
      })
    );

    res.json(tablesWithVisualState);
  } catch (err: any) {
    console.error('GET /tables error:', err);
    res.status(500).json({ message: 'Failed to fetch tables' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /tables/:tableId — single table with live counts and visual state
// ─────────────────────────────────────────────────────────────────────────────
tablesRouter.get('/:tableId', async (req, res) => {
  const { tableId } = req.params;
  const client = await pool.connect();
  try {
    const result = await client.query(
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
                                      AND (t.occupied_since IS NULL OR k.generated_at >= t.occupied_since)
       LEFT JOIN section_kots sk       ON sk.parent_kot_id   = k.kot_id
       LEFT JOIN section_kot_items ski ON ski.section_kot_id = sk.section_kot_id
       LEFT JOIN bills b               ON b.table_id         = t.table_id
                                      AND (t.occupied_since IS NULL OR b.created_at >= t.occupied_since)
       WHERE t.table_id = $1
       GROUP BY t.table_id`,
      [tableId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Table not found' });

    const tableData = result.rows[0];
    await ensureActiveTableQr(client, tableId);
    const sessionState = await fetchSessionState(client, tableId);
    const visualState = deriveTableVisualState(sessionState);

    res.json({
      ...tableData,
      visual_state: visualState,
      active_session_id: sessionState.session_id,
      session_status: sessionState.session_status,
    });
  } catch (err: any) {
    console.error('GET /tables/:tableId error:', err);
    res.status(500).json({ message: 'Failed to fetch table' });
  } finally {
    client.release();
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
    const table = result.rows[0];
    const client = await pool.connect();
    try {
      await ensureActiveTableQr(client, table.table_id);
    } finally {
      client.release();
    }
    res.status(201).json(table);
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
// POST /tables/qr/bootstrap — ensure every table has an active QR
// ─────────────────────────────────────────────────────────────────────────────
tablesRouter.post('/qr/bootstrap', async (_req, res) => {
  const client = await pool.connect();
  try {
    const tables = await client.query(`SELECT table_id FROM tables`);
    for (const row of tables.rows) {
      await ensureActiveTableQr(client, row.table_id);
    }
    res.json({ message: 'QR bootstrap complete', tables: tables.rows.length });
  } catch (err: any) {
    console.error('POST /tables/qr/bootstrap error:', err);
    res.status(500).json({ message: 'Failed to bootstrap QR codes' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /tables/:tableId/qr — fetch active QR for a table
// ─────────────────────────────────────────────────────────────────────────────
tablesRouter.get('/:tableId/qr', async (req, res) => {
  const { tableId } = req.params;
  const client = await pool.connect();
  try {
    const qr = await ensureActiveTableQr(client, tableId);
    res.json({ table_id: tableId, ...qr });
  } catch (err: any) {
    console.error('GET /tables/:tableId/qr error:', err);
    res.status(500).json({ message: 'Failed to fetch QR' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /tables/:tableId/qr/regenerate — invalidate old QR and create new
// ─────────────────────────────────────────────────────────────────────────────
tablesRouter.post('/:tableId/qr/regenerate', async (req, res) => {
  const { tableId } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE table_qr SET is_active = false, updated_at = NOW()
       WHERE table_id = $1 AND is_active = true`,
      [tableId]
    );
    const qrToken = await generateQrToken();
    const created = await client.query(
      `INSERT INTO table_qr (table_id, qr_token, is_active)
       VALUES ($1, $2, true)
       RETURNING qr_id, qr_token`,
      [tableId, qrToken]
    );
    await client.query('COMMIT');
    res.json({ table_id: tableId, ...created.rows[0] });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('POST /tables/:tableId/qr/regenerate error:', err);
    res.status(500).json({ message: 'Failed to regenerate QR' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /tables/:tableId/qr/disable — disable active QR
// ─────────────────────────────────────────────────────────────────────────────
tablesRouter.post('/:tableId/qr/disable', async (req, res) => {
  const { tableId } = req.params;
  try {
    await pool.query(
      `UPDATE table_qr SET is_active = false, updated_at = NOW()
       WHERE table_id = $1 AND is_active = true`,
      [tableId]
    );
    res.json({ message: 'QR disabled', table_id: tableId });
  } catch (err: any) {
    console.error('POST /tables/:tableId/qr/disable error:', err);
    res.status(500).json({ message: 'Failed to disable QR' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /tables/qr/resolve — resolve QR token to table and active session
// ─────────────────────────────────────────────────────────────────────────────
tablesRouter.post('/qr/resolve', async (req, res) => {
  const { token } = req.body;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ message: 'token is required' });
  }

  const client = await pool.connect();
  try {
    const qrResult = await client.query(
      `SELECT table_id FROM table_qr WHERE qr_token = $1 AND is_active = true LIMIT 1`,
      [token]
    );
    if (qrResult.rowCount === 0) {
      return res.status(404).json({ message: 'Invalid or disabled QR token.' });
    }

    const tableId = qrResult.rows[0].table_id;
    const sessionState = await fetchSessionState(client, tableId);

    res.json({
      table_id: tableId,
      active_session_id: sessionState.session_id,
      session_status: sessionState.session_status,
    });
  } catch (err: any) {
    console.error('POST /tables/qr/resolve error:', err);
    res.status(500).json({ message: 'Failed to resolve QR' });
  } finally {
    client.release();
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
    const sessionsToClose = await client.query(
      `SELECT ts.session_id
       FROM table_sessions ts
       LEFT JOIN session_tables st ON ts.session_id = st.session_id
       WHERE (ts.table_id = $1 OR st.table_id = $1)
         AND ts.status = ANY($2::text[])
       FOR UPDATE OF ts`,
      [tableId, ACTIVE_SESSION_STATUSES]
    );

    if (sessionsToClose.rows.length > 0) {
      const sessionIds = Array.from(new Set(sessionsToClose.rows.map((row: { session_id: string }) => row.session_id)));
      await client.query(
        `UPDATE table_sessions
         SET status = 'force_closed',
             ended_at = COALESCE(ended_at, NOW()),
             close_reason = $2,
             is_force_closed = true,
             closed_by = $3,
             last_activity_at = NOW(),
             version = version + 1
         WHERE session_id = ANY($1::uuid[])`,
        [sessionIds, reason.trim(), user_id ?? null]
      );

      for (const sessionId of sessionIds) {
        await client.query(
          `INSERT INTO session_events (session_id, event_type, timestamp, metadata, performed_by, source_device, source_channel)
           VALUES ($1, 'SESSION_FORCE_CLOSED', NOW(), $2, $3, 'POS_TERMINAL', 'ADMIN')`,
          [sessionId, JSON.stringify({ table_id: tableId, reason: reason.trim() }), user_id ?? null]
        );
      }
    }

    await client.query(
      `UPDATE tables
       SET status = 'free',
           is_bill_paid = false,
           active_item_count = 0,
           occupied_since = NULL
       WHERE table_id = $1`,
      [tableId]
    );
    
    console.log(`[PATCH /tables/:tableId/force-free] Table ${tableId}: status → 'free', occupied_since → NULL (FORCED)`);


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
// GET /tables/:tableId/orders — active orders for current session ONLY
// 
// CRITICAL: Returns ONLY orders belonging to the active session.
// Historical orders from previous sessions are NEVER shown.
// ─────────────────────────────────────────────────────────────────────────────
tablesRouter.get('/:tableId/orders', async (req, res) => {
  const { tableId } = req.params;
  const client = await pool.connect();
  try {
    // Step 1: Fetch table metadata for legacy fallback
    const tableMeta = await client.query(
      `SELECT occupied_since FROM tables WHERE table_id = $1`,
      [tableId]
    );
    const occupiedSince = tableMeta.rows[0]?.occupied_since ?? null;

    // Step 2: Find active session for this table
    const sessionQuery = await client.query(
      `SELECT ts.session_id FROM table_sessions ts
       LEFT JOIN session_tables st ON ts.session_id = st.session_id
       WHERE (ts.table_id = $1 OR st.table_id = $1)
         AND ts.status IN ('active', 'billed', 'payment_pending', 'payment_done', 'waiting_service_completion', 'ready_to_close')
       LIMIT 1`,
      [tableId]
    );

    // Step 2: If no active session, return empty (table is FREE)
    if (sessionQuery.rows.length === 0) {
      console.log(`[GET /tables/${tableId}/orders] ✓ No active session - returning empty orders`);
      return res.json({ orders: [], active_session_id: null, order_count: 0 });
    }

    const activeSessionId = sessionQuery.rows[0].session_id;
    console.log(`[GET /tables/${tableId}/orders] ✓ Found active session: ${activeSessionId}`);

    // Step 3: Fetch ONLY running orders from active session (exclude completed)
    const ordersResult = await client.query(
      `SELECT
         o.order_id,
         o.table_id,
         o.order_phase,
         o.status AS order_status,
         COALESCE(kot_state.display_status, o.status::text) AS status,
         o.created_at,
         o.session_id
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
       ORDER BY o.order_phase`,
      [activeSessionId]
    );

    console.log(`[GET /tables/${tableId}/orders] ✓ Found ${ordersResult.rows.length} running orders in active session`);

    // Step 4: Hydrate orders with their items
    let orders = await Promise.all(
      ordersResult.rows.map(async (order: { order_id: string }) => {
        const itemsResult = await client.query(
          `SELECT oi.order_item_id, oi.item_id, i.name as item_name,
                  oi.quantity, oi.price_at_billing, oi.gst_percent_at_billing,
                  oi.extras, oi.spice_level
           FROM order_items oi
           LEFT JOIN items i ON i.id = oi.item_id
           WHERE oi.order_id = $1`,
          [order.order_id]
        );
        return { ...order, items: itemsResult.rows };
      })
    );

    if (orders.length === 0) {
      console.log(`[GET /tables/${tableId}/orders] ✓ No session orders found - trying legacy table orders`);
      const legacyOrdersResult = await client.query(
        `SELECT
           o.order_id,
           o.table_id,
           o.order_phase,
           o.status AS order_status,
           COALESCE(kot_state.display_status, o.status::text) AS status,
           o.created_at,
           o.session_id
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
         WHERE o.table_id = $1
           AND ($2::timestamp IS NULL OR o.created_at >= $2::timestamp)
         ORDER BY o.order_phase`,
        [tableId, occupiedSince]
      );

      if (legacyOrdersResult.rows.length > 0) {
        orders = await Promise.all(
          legacyOrdersResult.rows.map(async (order: { order_id: string }) => {
            const itemsResult = await client.query(
              `SELECT oi.order_item_id, oi.item_id, i.name as item_name,
                      oi.quantity, oi.price_at_billing, oi.gst_percent_at_billing,
                      oi.extras, oi.spice_level
               FROM order_items oi
               LEFT JOIN items i ON i.id = oi.item_id
               WHERE oi.order_id = $1`,
              [order.order_id]
            );
            return { ...order, items: itemsResult.rows };
          })
        );
      }
    }

    // Step 5: Return orders with session context
    res.json({
      orders: orders,
      active_session_id: activeSessionId,
      order_count: orders.length,
    });
  } catch (err: any) {
    console.error(`GET /tables/${tableId}/orders error:`, err);
    res.status(500).json({ message: 'Failed to fetch table orders' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /tables/:tableId/unbilled-items — items pending billing for current session
// ─────────────────────────────────────────────────────────────────────────────
tablesRouter.get('/:tableId/unbilled-items', async (req, res) => {
  const { tableId } = req.params;
  const client = await pool.connect();
  try {
    const tableMeta = await client.query(
      `SELECT occupied_since FROM tables WHERE table_id = $1`,
      [tableId]
    );
    const occupiedSince = tableMeta.rows[0]?.occupied_since ?? null;

    const sessionQuery = await client.query(
      `SELECT ts.session_id FROM table_sessions ts
       LEFT JOIN session_tables st ON ts.session_id = st.session_id
       WHERE (ts.table_id = $1 OR st.table_id = $1)
         AND ts.status IN ('active', 'billed', 'payment_pending', 'payment_done', 'waiting_service_completion', 'ready_to_close')
       LIMIT 1`,
      [tableId]
    );

    if (sessionQuery.rows.length === 0) {
      return res.json({ items: [], active_session_id: null });
    }

    const activeSessionId = sessionQuery.rows[0].session_id;

    const itemsResult = await client.query(
      `SELECT oi.order_item_id, oi.item_id, i.name as item_name,
              oi.quantity, oi.price_at_billing, oi.gst_percent_at_billing
       FROM order_items oi
       JOIN orders o ON o.order_id = oi.order_id
       JOIN items i ON i.id = oi.item_id
       WHERE o.session_id = $1
         AND oi.billing_status = 'UNBILLED'
       ORDER BY o.order_phase, oi.created_at`,
      [activeSessionId]
    );

    if (itemsResult.rowCount === 0) {
      const legacyItems = await client.query(
        `SELECT oi.order_item_id, oi.item_id, i.name as item_name,
                oi.quantity, oi.price_at_billing, oi.gst_percent_at_billing
         FROM order_items oi
         JOIN orders o ON o.order_id = oi.order_id
         JOIN items i ON i.id = oi.item_id
         WHERE o.table_id = $1
           AND ($2::timestamp IS NULL OR o.created_at >= $2::timestamp)
           AND oi.billing_status = 'UNBILLED'
         ORDER BY o.order_phase, oi.created_at`,
        [tableId, occupiedSince]
      );

      return res.json({ items: legacyItems.rows, active_session_id: activeSessionId });
    }

    res.json({ items: itemsResult.rows, active_session_id: activeSessionId });
  } catch (err: any) {
    console.error(`GET /tables/${tableId}/unbilled-items error:`, err);
    res.status(500).json({ message: 'Failed to fetch unbilled items' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /tables/:tableId/orders — create order for a table
// ─────────────────────────────────────────────────────────────────────────────
tablesRouter.post('/:tableId/orders', async (req, res) => {
  const { tableId } = req.params;
  const { items, assigned_waiter_id, source_type, order_type, orderType, payment_option, paymentOption, special_instructions, specialInstructions, notes } = req.body;

  const orderTypeVal = order_type || orderType || 'Dine In';
  const paymentOptionVal = payment_option || paymentOption || 'Pay at Restaurant';
  const specialInstructionsVal = special_instructions || specialInstructions || notes || null;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'items array is required and cannot be empty' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tableCheck = await client.query(
      `SELECT table_id, table_number, status FROM tables WHERE table_id = $1 FOR UPDATE`,
      [tableId]
    );
    if (tableCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Table not found' });
    }
    const currentStatus = tableCheck.rows[0].status;

    // ─── SESSION INTEGRATION ─────────────────────────────────────────────────
    // 1. Look up the active session for this table (including merges)
    const sessionQuery = await client.query(
      `SELECT ts.session_id, ts.is_payment_locked, ts.status, ts.version
       FROM table_sessions ts
       LEFT JOIN session_tables st ON ts.session_id = st.session_id
       WHERE (ts.table_id = $1 OR st.table_id = $1)
         AND ts.status IN ('active', 'billed', 'payment_pending', 'payment_done', 'waiting_service_completion', 'ready_to_close')
       LIMIT 1 FOR UPDATE OF ts`,
      [tableId]
    );

    let finalSessionId: string;
    const finalSourceType = source_type ?? 'POS';

    if (sessionQuery.rows.length > 0) {
      const activeSession = sessionQuery.rows[0];

      // Enforce ADDITION 3: Lock items during payment
      if (activeSession.is_payment_locked) {
        await client.query('ROLLBACK');
        return res.status(422).json({
          message: 'This session is locked for payment processing. No new orders or items can be added.'
        });
      }

      finalSessionId = activeSession.session_id;

      // Enforce State Machine Rule: billed/payment_pending -> active when new order is added
      if (activeSession.status === 'billed' || activeSession.status === 'payment_pending') {
        await client.query(
          `UPDATE table_sessions
           SET status = 'active',
               last_activity_at = NOW(),
               version = version + 1
           WHERE session_id = $1`,
          [finalSessionId]
        );

        // Record State Transition Event
        await client.query(
          `INSERT INTO session_events (
            session_id, event_type, timestamp, metadata, source_device, source_channel
          ) VALUES ($1, 'SESSION_REOPENED', NOW(), $2, $3, $4)`,
          [
            finalSessionId,
            JSON.stringify({ previous_status: activeSession.status, reason: 'New order added' }),
            req.header('x-device') ?? 'POS_TERMINAL',
            source_type ?? 'POS'
          ]
        );
      }
    } else {
      // Auto-start session for waiter-friendly backwards compatibility
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomHex = randomBytes(3).toString('hex').toUpperCase();
      const sessionCode = `SESS-T${tableCheck.rows[0].table_number}-${dateStr}-${randomHex}`;

      const newSessionResult = await client.query(
        `INSERT INTO table_sessions (
           table_id, session_code, status, guest_count, started_at,
           payment_status, is_payment_locked, is_force_closed, source_type,
           assigned_waiter_id, version
         ) VALUES ($1, $2, 'active', 1, NOW(), 'unpaid', false, false, $3, $4, 1)
         RETURNING session_id`,
        [tableId, sessionCode, finalSourceType, assigned_waiter_id ?? null]
      );
      finalSessionId = newSessionResult.rows[0].session_id;

      await client.query(
        `INSERT INTO session_tables (session_id, table_id) VALUES ($1, $2)`,
        [finalSessionId, tableId]
      );

      // Event log
      await client.query(
        `INSERT INTO session_events (
          session_id, event_type, timestamp, metadata, source_device, source_channel
         ) VALUES ($1, 'SESSION_STARTED', NOW(), $2, $3, $4)`,
        [
          finalSessionId,
          JSON.stringify({ table_number: tableCheck.rows[0].table_number, guest_count: 1, note: 'Auto-started by order placement' }),
          req.header('x-device') ?? 'POS_TERMINAL',
          finalSourceType
        ]
      );
    }
    // ─────────────────────────────────────────────────────────────────────────

    const phaseResult = await client.query(
      `SELECT COALESCE(MAX(order_phase), 0) + 1 as next_phase FROM orders WHERE table_id = $1`,
      [tableId]
    );
    const orderPhase = phaseResult.rows[0].next_phase;

    // RULE 2: Order belongs to session_id
    const orderResult = await client.query(
      `INSERT INTO orders (table_id, order_phase, status, session_id, source_type, order_type, payment_option, notes)
       VALUES ($1, $2, 'open', $3, $4, $5, $6, $7)
       RETURNING order_id, table_id, order_phase, status, created_at, session_id, source_type, order_type, payment_option, notes`,
      [tableId, orderPhase, finalSessionId, finalSourceType, orderTypeVal, paymentOptionVal, specialInstructionsVal]
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

    // Update active_order_id on table_sessions
    await client.query(
      `UPDATE table_sessions
       SET active_order_id = $1,
           last_activity_at = NOW(),
           version = version + 1
       WHERE session_id = $2`,
      [newOrder.order_id, finalSessionId]
    );

    // Mark table occupied; if it was ready_to_free (EC-10: late KOT after billing), revert
    const newTableStatus =
      currentStatus === 'waiting_for_service_completion' ||
      currentStatus === 'ready_to_free' ||
      currentStatus === 'billing_done'
        ? 'waiting_for_service_completion'
        : 'occupied';

    const updateResult = await client.query(
      `UPDATE tables
       SET status = $1,
           occupied_since = COALESCE(occupied_since, NOW())
       WHERE table_id = $2
       RETURNING occupied_since`,
      [newTableStatus, tableId]
    );
    
    const occupiedSince = updateResult.rows[0]?.occupied_since;
    console.log(`[POST /tables/:tableId/orders] Table ${tableId}: status '${currentStatus}' → '${newTableStatus}', occupied_since SET to ${new Date(occupiedSince).toISOString()}`);

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

