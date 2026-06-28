import { Router } from 'express';
import { pool } from '../db';
import crypto from 'crypto';
import { canCloseSession } from '../tables/table-management';

export const sessionsRouter = Router();

// Helper to generate a unique readable session code
async function generateSessionCode(tableNumber: string): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `SESS-T${tableNumber}-${dateStr}-${randomHex}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /sessions/start — Start a new dining session for a table (RULE 1)
// ─────────────────────────────────────────────────────────────────────────────
sessionsRouter.post('/start', async (req, res) => {
  const { table_id, guest_count, assigned_waiter_id, notes, source_type } = req.body;

  if (!table_id) {
    res.status(400).json({ message: 'table_id is required.' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock and retrieve the target table to ensure it exists and prevent race conditions
    const tableResult = await client.query(
      `SELECT table_id, table_number, status, tenant_id, outlet_id FROM tables WHERE table_id = $1 FOR UPDATE`,
      [table_id]
    );
    if (tableResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Table not found.' });
      return;
    }
    const table = tableResult.rows[0];

    // 2. Enforce RULE 1: Table can only have ONE active session.
    // Check both direct table reference and merged table mappings in session_tables.
    const activeCheck = await client.query(
      `SELECT ts.session_id, ts.session_code, ts.status
       FROM table_sessions ts
       LEFT JOIN session_tables st ON ts.session_id = st.session_id
       WHERE (ts.table_id = $1 OR st.table_id = $1)
         AND ts.status IN ('active', 'billed', 'payment_pending', 'payment_done', 'waiting_service_completion', 'ready_to_close')
       LIMIT 1`,
      [table_id]
    );

    if (activeCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      res.status(409).json({
        message: `Table ${table.table_number} already has an active session.`,
        activeSession: activeCheck.rows[0],
      });
      return;
    }

    // 3. Generate session properties
    const guestCountParsed = parseInt(guest_count ?? '1', 10);
    const sessionCode = await generateSessionCode(table.table_number);
    const finalSourceType = source_type ?? 'POS';

    // 4. Create the table_sessions record
    const insertResult = await client.query(
      `INSERT INTO table_sessions (
        table_id, session_code, status, guest_count, started_at,
        created_by, active_order_id, payment_status, is_payment_locked,
        is_force_closed, source_type, assigned_waiter_id, notes, version, tenant_id, outlet_id
      ) VALUES ($1, $2, 'active', $3, NOW(), $4, NULL, 'unpaid', false, false, $5, $6, $7, 1, $8, $9)
      RETURNING *`,
      [
        table_id,
        sessionCode,
        guestCountParsed,
        req.body.created_by ?? null,
        finalSourceType,
        assigned_waiter_id ?? null,
        notes ?? null,
        table.tenant_id,
        table.outlet_id
      ]
    );
    const session = insertResult.rows[0];

    // 5. Link table in session_tables mapping
    await client.query(
      `INSERT INTO session_tables (session_id, table_id, tenant_id, outlet_id) VALUES ($1, $2, $3, $4)`,
      [session.session_id, table_id, table.tenant_id, table.outlet_id]
    );

    // 6. Update the table status to occupied
    await client.query(
      `UPDATE tables SET status = 'occupied', occupied_since = NOW() WHERE table_id = $1`,
      [table_id]
    );

    // 7. Write the SESSION_STARTED event log
    await client.query(
      `INSERT INTO session_events (
        session_id, event_type, timestamp, metadata, performed_by, source_device, source_channel, tenant_id, outlet_id
      ) VALUES ($1, 'SESSION_STARTED', NOW(), $2, $3, $4, $5, $6, $7)`,
      [
        session.session_id,
        JSON.stringify({ table_number: table.table_number, guest_count: guestCountParsed }),
        req.body.created_by ?? null,
        req.header('x-device') ?? 'POS_TERMINAL',
        finalSourceType,
        table.tenant_id,
        table.outlet_id
      ]
    );

    await client.query('COMMIT');
    res.status(201).json(session);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to start session:', error);
    const message = error instanceof Error ? error.message : 'Failed to start session.';
    res.status(400).json({ message });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /sessions/active/:tableId — Retrieve active session for a table
// ─────────────────────────────────────────────────────────────────────────────
sessionsRouter.get('/active/:tableId', async (req, res) => {
  const { tableId } = req.params;

  try {
    const activeResult = await pool.query(
      `SELECT ts.*, t.table_number,
              (
                SELECT json_agg(json_build_object('table_id', st.table_id, 'table_number', tbl.table_number))
                FROM session_tables st
                JOIN tables tbl ON tbl.table_id = st.table_id
                WHERE st.session_id = ts.session_id
              ) as mapped_tables
       FROM table_sessions ts
       JOIN tables t ON t.table_id = ts.table_id
       LEFT JOIN session_tables st ON st.session_id = ts.session_id
       WHERE (ts.table_id = $1 OR st.table_id = $1)
         AND ts.status IN ('active', 'billed', 'payment_pending', 'payment_done', 'waiting_service_completion', 'ready_to_close')
       LIMIT 1`,
      [tableId]
    );

    if (activeResult.rows.length === 0) {
      res.status(404).json({ message: 'No active session found for this table.' });
      return;
    }

    res.json(activeResult.rows[0]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch active session.';
    res.status(400).json({ message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /sessions/reopen — Reopen a billed/locked session for a table
// ─────────────────────────────────────────────────────────────────────────────
sessionsRouter.post('/reopen', async (req, res) => {
  const { table_id, performed_by, reason, source_type } = req.body;

  if (!table_id) {
    return res.status(400).json({ message: 'table_id is required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sessionResult = await client.query(
      `SELECT ts.session_id, ts.table_id, ts.status, ts.is_payment_locked
       FROM table_sessions ts
       LEFT JOIN session_tables st ON ts.session_id = st.session_id
       WHERE (ts.table_id = $1 OR st.table_id = $1)
         AND ts.status IN ('active', 'billed', 'payment_pending', 'payment_done', 'waiting_service_completion', 'ready_to_close')
       LIMIT 1
       FOR UPDATE OF ts`,
      [table_id]
    );

    if (sessionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'No active session found for this table.' });
    }

    const session = sessionResult.rows[0];
    const previousStatus = session.status;

    if (previousStatus === 'active' && !session.is_payment_locked) {
      await client.query('COMMIT');
      return res.json({ message: 'Session already active and unlocked.', session_id: session.session_id });
    }

    await client.query(
      `UPDATE table_sessions
       SET status = 'active',
           payment_status = 'unpaid',
           is_payment_locked = false,
           last_activity_at = NOW(),
           version = version + 1
       WHERE session_id = $1`,
      [session.session_id]
    );

    await client.query(
      `UPDATE tables
       SET status = 'occupied',
           is_bill_paid = false,
           occupied_since = COALESCE(occupied_since, NOW())
       WHERE table_id = $1
          OR table_id IN (SELECT table_id FROM session_tables WHERE session_id = $2)`,
      [session.table_id, session.session_id]
    );

    await client.query(
      `INSERT INTO session_events (
        session_id, event_type, timestamp, metadata, performed_by, source_device, source_channel
       ) VALUES ($1, 'SESSION_REOPENED', NOW(), $2, $3, $4, $5)`,
      [
        session.session_id,
        JSON.stringify({ previous_status: previousStatus, reason: reason ?? 'Reopened for new orders' }),
        performed_by ?? null,
        req.header('x-device') ?? 'POS_TERMINAL',
        source_type ?? 'POS',
      ]
    );

    await client.query('COMMIT');
    return res.json({ message: 'Session reopened.', session_id: session.session_id });
  } catch (error) {
    await client.query('ROLLBACK');
    const message = error instanceof Error ? error.message : 'Failed to reopen session.';
    return res.status(400).json({ message });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// IDEMPOTENCY HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────
async function checkIdempotency(client: any, key: string | undefined): Promise<any | null> {
  if (!key) return null;
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  const result = await client.query(
    `SELECT response_status, response_body FROM idempotency_keys WHERE key_hash = $1`,
    [hash]
  );
  if (result.rows.length > 0) {
    return {
      status: result.rows[0].response_status,
      body: result.rows[0].response_body
    };
  }
  return null;
}

async function saveIdempotency(client: any, key: string | undefined, status: number, body: any): Promise<void> {
  if (!key) return;
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  await client.query(
    `INSERT INTO idempotency_keys (key_hash, response_status, response_body)
     VALUES ($1, $2, $3)
     ON CONFLICT (key_hash) DO UPDATE SET response_status = $2, response_body = $3`,
    [hash, status, JSON.stringify(body)]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /sessions/:sessionId/transfer — Transfer active session to another table
// ─────────────────────────────────────────────────────────────────────────────
sessionsRouter.post('/:sessionId/transfer', async (req, res) => {
  const { sessionId } = req.params;
  const { target_table_id, performed_by } = req.body;
  const idempotencyKey = req.header('x-idempotency-key');

  if (!target_table_id) {
    res.status(400).json({ message: 'target_table_id is required.' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Check idempotency
    const cached = await checkIdempotency(client, idempotencyKey);
    if (cached) {
      await client.query('COMMIT');
      res.status(cached.status).json(cached.body);
      return;
    }

    // 2. Lock the session row to prevent race conditions (EC-3 Concurrency lock)
    const sessionResult = await client.query(
      `SELECT session_id, table_id, is_payment_locked, status, version FROM table_sessions WHERE session_id = $1 FOR UPDATE`,
      [sessionId]
    );
    if (sessionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Session not found.' });
      return;
    }
    const session = sessionResult.rows[0];
    const sourceTableId = session.table_id;

    // Enforce ADDITION 3: Prevent transfer during payment lock
    if (session.is_payment_locked) {
      await client.query('ROLLBACK');
      res.status(422).json({ message: 'Session is locked for payment processing. Cannot transfer table.' });
      return;
    }

    // Enforce State Machine terminal check
    if (['completed', 'force_closed', 'abandoned'].includes(session.status)) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'Cannot transfer a closed session.' });
      return;
    }

    // 3. Lock target table and check active session
    const targetTableResult = await client.query(
      `SELECT table_id, table_number, status FROM tables WHERE table_id = $1 FOR UPDATE`,
      [target_table_id]
    );
    if (targetTableResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Target table not found.' });
      return;
    }
    const targetTable = targetTableResult.rows[0];

    const targetSessionCheck = await client.query(
      `SELECT session_id FROM table_sessions ts
       LEFT JOIN session_tables st ON ts.session_id = st.session_id
       WHERE (ts.table_id = $1 OR st.table_id = $1)
         AND ts.status IN ('active', 'billed', 'payment_pending', 'payment_done', 'waiting_service_completion', 'ready_to_close')
       LIMIT 1`,
      [target_table_id]
    );
    if (targetSessionCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      res.status(409).json({ message: `Target table ${targetTable.table_number} already has an active session.` });
      return;
    }

    // 4. Perform optimistic locking check on version
    const expectedVersion = req.body.version ?? session.version;
    if (session.version !== expectedVersion) {
      await client.query('ROLLBACK');
      res.status(409).json({ message: 'Stale version detected. Session has been modified concurrently.' });
      return;
    }

    // 5. Update session table reference
    await client.query(
      `UPDATE table_sessions
       SET table_id = $1,
           last_activity_at = NOW(),
           version = version + 1
       WHERE session_id = $2`,
      [target_table_id, sessionId]
    );

    // 6. Update session_tables mapping (keep history immutable on old KOTs/bills!)
    await client.query(
      `DELETE FROM session_tables WHERE session_id = $1 AND table_id = $2`,
      [sessionId, sourceTableId]
    );
    await client.query(
      `INSERT INTO session_tables (session_id, table_id) VALUES ($1, $2)`,
      [sessionId, target_table_id]
    );

    // 7. Update source and target table statuses
    await client.query(
      `UPDATE tables
       SET status = 'free',
           occupied_since = NULL,
           is_bill_paid = false,
           active_item_count = 0
       WHERE table_id = $1`,
      [sourceTableId]
    );
    await client.query(
      `UPDATE tables
       SET status = 'occupied',
           occupied_since = NOW()
       WHERE table_id = $1`,
      [target_table_id]
    );

    // 8. Event log & audit
    await client.query(
      `INSERT INTO session_events (
        session_id, event_type, timestamp, metadata, performed_by, source_device, source_channel
      ) VALUES ($1, 'TABLE_TRANSFERRED', NOW(), $2, $3, $4, $5)`,
      [
        sessionId,
        JSON.stringify({ source_table_id: sourceTableId, target_table_id }),
        performed_by ?? null,
        req.header('x-device') ?? 'POS_TERMINAL',
        session.source_type
      ]
    );

    const responseBody = { message: `Session successfully transferred to Table ${targetTable.table_number}.` };
    await saveIdempotency(client, idempotencyKey, 200, responseBody);

    await client.query('COMMIT');
    res.json(responseBody);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to transfer session:', error);
    res.status(500).json({ message: 'Failed to transfer session.' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /sessions/:sessionId/merge — Merge another table into active session (RULE 7)
// ─────────────────────────────────────────────────────────────────────────────
sessionsRouter.post('/:sessionId/merge', async (req, res) => {
  const { sessionId } = req.params;
  const { target_table_id, performed_by } = req.body;
  const idempotencyKey = req.header('x-idempotency-key');

  if (!target_table_id) {
    res.status(400).json({ message: 'target_table_id is required.' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const cached = await checkIdempotency(client, idempotencyKey);
    if (cached) {
      await client.query('COMMIT');
      res.status(cached.status).json(cached.body);
      return;
    }

    // Lock session
    const sessionResult = await client.query(
      `SELECT * FROM table_sessions WHERE session_id = $1 FOR UPDATE`,
      [sessionId]
    );
    if (sessionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Session not found.' });
      return;
    }
    const session = sessionResult.rows[0];

    // Enforce post-payment guards (Edge Case 2)
    if (session.payment_status !== 'unpaid' || session.is_payment_locked) {
      await client.query('ROLLBACK');
      res.status(422).json({ message: 'Cannot merge tables after payment initiation or while payment is locked.' });
      return;
    }

    // Lock target table
    const targetTableResult = await client.query(
      `SELECT table_id, table_number FROM tables WHERE table_id = $1 FOR UPDATE`,
      [target_table_id]
    );
    if (targetTableResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Target table not found.' });
      return;
    }
    const targetTable = targetTableResult.rows[0];

    // Check target table has no separate active session
    const targetSessionCheck = await client.query(
      `SELECT session_id FROM table_sessions ts
       LEFT JOIN session_tables st ON ts.session_id = st.session_id
       WHERE (ts.table_id = $1 OR st.table_id = $1)
         AND ts.status IN ('active', 'billed', 'payment_pending', 'payment_done', 'waiting_service_completion', 'ready_to_close')
       LIMIT 1`,
      [target_table_id]
    );
    if (targetSessionCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      res.status(409).json({ message: `Target table ${targetTable.table_number} is already occupied in a session.` });
      return;
    }

    // Version check
    const expectedVersion = req.body.version ?? session.version;
    if (session.version !== expectedVersion) {
      await client.query('ROLLBACK');
      res.status(409).json({ message: 'Stale version detected.' });
      return;
    }

    // Merge: insert target table to session_tables mapping
    await client.query(
      `INSERT INTO session_tables (session_id, table_id) VALUES ($1, $2)`,
      [sessionId, target_table_id]
    );

    // Update target table to occupied
    await client.query(
      `UPDATE tables SET status = 'occupied', occupied_since = NOW() WHERE table_id = $1`,
      [target_table_id]
    );

    // Event log
    await client.query(
      `INSERT INTO session_events (
        session_id, event_type, timestamp, metadata, performed_by, source_device, source_channel
      ) VALUES ($1, 'TABLE_MERGED', NOW(), $2, $3, $4, $5)`,
      [
        sessionId,
        JSON.stringify({ merged_table_id: target_table_id, table_number: targetTable.table_number }),
        performed_by ?? null,
        req.header('x-device') ?? 'POS_TERMINAL',
        session.source_type
      ]
    );

    const responseBody = { message: `Table ${targetTable.table_number} successfully merged into dining session.` };
    await saveIdempotency(client, idempotencyKey, 200, responseBody);

    await client.query('COMMIT');
    res.json(responseBody);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to merge tables:', error);
    res.status(500).json({ message: 'Failed to merge tables.' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /sessions/:sessionId/payment-lock — Toggle session payment locking
// ─────────────────────────────────────────────────────────────────────────────
sessionsRouter.post('/:sessionId/payment-lock', async (req, res) => {
  const { sessionId } = req.params;
  const { lock } = req.body;

  try {
    const result = await pool.query(
      `UPDATE table_sessions
       SET is_payment_locked = $1,
           last_activity_at = NOW(),
           version = version + 1
       WHERE session_id = $2 RETURNING *`,
      [lock === true, sessionId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ message: 'Session not found.' });
      return;
    }

    res.json({ message: `Session payment lock set to ${lock === true}.`, session: result.rows[0] });
  } catch (error) {
    res.status(500).json({ message: 'Failed to set payment lock.' });
  }
});

// Helper to generate immutable final session snapshot
async function generateSessionSnapshot(client: any, sessionId: string): Promise<any> {
  const sessionRes = await client.query('SELECT * FROM table_sessions WHERE session_id = $1', [sessionId]);
  const session = sessionRes.rows[0];

  const billsRes = await client.query(
    `SELECT b.*,
            (SELECT json_agg(bi.*) FROM bill_items bi WHERE bi.bill_id = b.id) as items
     FROM bills b WHERE b.session_id = $1`,
    [sessionId]
  );
  
  const eventsRes = await client.query(
    `SELECT event_type, timestamp, metadata FROM session_events WHERE session_id = $1 ORDER BY timestamp ASC`,
    [sessionId]
  );

  return {
    session: {
      session_id: session.session_id,
      session_code: session.session_code,
      guest_count: session.guest_count,
      started_at: session.started_at,
      ended_at: new Date()
    },
    bills: billsRes.rows,
    timeline: eventsRes.rows
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /sessions/:sessionId/close — Clean close dining session (RULE 5 & 7)
// ─────────────────────────────────────────────────────────────────────────────
sessionsRouter.post('/:sessionId/close', async (req, res) => {
  const { sessionId } = req.params;
  const { closed_by } = req.body;
  const idempotencyKey = req.header('x-idempotency-key');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const cached = await checkIdempotency(client, idempotencyKey);
    if (cached) {
      await client.query('COMMIT');
      res.status(cached.status).json(cached.body);
      return;
    }

    // Lock session
    const sessionRes = await client.query(
      `SELECT * FROM table_sessions WHERE session_id = $1 FOR UPDATE`,
      [sessionId]
    );
    if (sessionRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Session not found.' });
      return;
    }
    const session = sessionRes.rows[0];

    // Enforce State Machine Terminal Check
    if (['completed', 'force_closed', 'abandoned'].includes(session.status)) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'Session is already closed.' });
      return;
    }

    // Enforce Rule 5 close validation
    const { canClose, reason } = await canCloseSession(client, sessionId);
    if (!canClose) {
      await client.query('ROLLBACK');
      res.status(422).json({ message: `Session cannot be closed: ${reason}` });
      return;
    }

    // Fetch all mapped tables to free them
    const tablesRes = await client.query(`SELECT table_id FROM session_tables WHERE session_id = $1`, [sessionId]);
    const tableIds = tablesRes.rows.map((r: any) => r.table_id);

    // Create final snapshot (ADDITION 5)
    const snapshot = await generateSessionSnapshot(client, sessionId);

    // Update session status to completed
    await client.query(
      `UPDATE table_sessions
       SET status = 'completed',
           ended_at = NOW(),
           closed_by = $1,
           snapshot = $2,
           version = version + 1
       WHERE session_id = $3`,
      [closed_by ?? null, JSON.stringify(snapshot), sessionId]
    );

    // Free mapped tables
    if (tableIds.length > 0) {
      await client.query(
        `UPDATE tables
         SET status = 'free',
             occupied_since = NULL,
             active_item_count = 0,
             is_bill_paid = false
         WHERE table_id = ANY($1::uuid[])`,
        [tableIds]
      );
      
      // Delete session table mappings
      await client.query(`DELETE FROM session_tables WHERE session_id = $1`, [sessionId]);
    }

    // Log SESSION_CLOSED event
    await client.query(
      `INSERT INTO session_events (
        session_id, event_type, timestamp, metadata, performed_by, source_device, source_channel
      ) VALUES ($1, 'SESSION_CLOSED', NOW(), $2, $3, $4, $5)`,
      [
        sessionId,
        JSON.stringify({ close_type: 'clean' }),
        closed_by ?? null,
        req.header('x-device') ?? 'POS_TERMINAL',
        session.source_type
      ]
    );

    const responseBody = { message: 'Session cleanly closed. Tables are now free.', snapshot };
    await saveIdempotency(client, idempotencyKey, 200, responseBody);

    await client.query('COMMIT');
    res.json(responseBody);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to close session:', error);
    res.status(500).json({ message: 'Failed to close session.' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /sessions/:sessionId/force-close — Admin override force close (EC-3 & 5)
// ─────────────────────────────────────────────────────────────────────────────
sessionsRouter.post('/:sessionId/force-close', async (req, res) => {
  const { sessionId } = req.params;
  const { closed_by, close_reason } = req.body;
  const idempotencyKey = req.header('x-idempotency-key');

  if (!close_reason || close_reason.trim().length === 0) {
    res.status(400).json({ message: 'close_reason is mandatory for force-close.' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const cached = await checkIdempotency(client, idempotencyKey);
    if (cached) {
      await client.query('COMMIT');
      res.status(cached.status).json(cached.body);
      return;
    }

    const sessionRes = await client.query(
      `SELECT * FROM table_sessions WHERE session_id = $1 FOR UPDATE`,
      [sessionId]
    );
    if (sessionRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Session not found.' });
      return;
    }
    const session = sessionRes.rows[0];

    if (['completed', 'force_closed', 'abandoned'].includes(session.status)) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'Session is already closed.' });
      return;
    }

    const tablesRes = await client.query(`SELECT table_id FROM session_tables WHERE session_id = $1`, [sessionId]);
    const tableIds = tablesRes.rows.map((r: any) => r.table_id);

    const snapshot = await generateSessionSnapshot(client, sessionId);

    // Force close: bypass Rule 5
    await client.query(
      `UPDATE table_sessions
       SET status = 'force_closed',
           ended_at = NOW(),
           closed_by = $1,
           close_reason = $2,
           is_force_closed = true,
           snapshot = $3,
           version = version + 1
       WHERE session_id = $4`,
      [closed_by ?? null, close_reason, JSON.stringify(snapshot), sessionId]
    );

    if (tableIds.length > 0) {
      await client.query(
        `UPDATE tables
         SET status = 'free',
             occupied_since = NULL,
             active_item_count = 0,
             is_bill_paid = false
         WHERE table_id = ANY($1::uuid[])`,
        [tableIds]
      );
      await client.query(`DELETE FROM session_tables WHERE session_id = $1`, [sessionId]);
    }

    await client.query(
      `INSERT INTO session_events (
        session_id, event_type, timestamp, metadata, performed_by, source_device, source_channel
      ) VALUES ($1, 'SESSION_FORCE_CLOSED', NOW(), $2, $3, $4, $5)`,
      [
        sessionId,
        JSON.stringify({ close_type: 'forced', reason: close_reason }),
        closed_by ?? null,
        req.header('x-device') ?? 'POS_TERMINAL',
        session.source_type
      ]
    );

    const responseBody = { message: 'Session force-closed by admin. Tables freed.', snapshot };
    await saveIdempotency(client, idempotencyKey, 200, responseBody);

    await client.query('COMMIT');
    res.json(responseBody);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to force close session:', error);
    res.status(500).json({ message: 'Failed to force close session.' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /sessions/:sessionId/abandon — Customer leaves without payment (EC-1 & 5)
// ─────────────────────────────────────────────────────────────────────────────
sessionsRouter.post('/:sessionId/abandon', async (req, res) => {
  const { sessionId } = req.params;
  const { closed_by, close_reason } = req.body;
  const idempotencyKey = req.header('x-idempotency-key');

  if (!close_reason || close_reason.trim().length === 0) {
    res.status(400).json({ message: 'close_reason is mandatory for abandoning session.' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const cached = await checkIdempotency(client, idempotencyKey);
    if (cached) {
      await client.query('COMMIT');
      res.status(cached.status).json(cached.body);
      return;
    }

    const sessionRes = await client.query(
      `SELECT * FROM table_sessions WHERE session_id = $1 FOR UPDATE`,
      [sessionId]
    );
    if (sessionRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Session not found.' });
      return;
    }
    const session = sessionRes.rows[0];

    if (['completed', 'force_closed', 'abandoned'].includes(session.status)) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'Session is already closed.' });
      return;
    }

    const tablesRes = await client.query(`SELECT table_id FROM session_tables WHERE session_id = $1`, [sessionId]);
    const tableIds = tablesRes.rows.map((r: any) => r.table_id);

    const snapshot = await generateSessionSnapshot(client, sessionId);

    // Abandon: mark abandoned, free table, audit mandatory
    await client.query(
      `UPDATE table_sessions
       SET status = 'abandoned',
           ended_at = NOW(),
           closed_by = $1,
           close_reason = $2,
           snapshot = $3,
           version = version + 1
       WHERE session_id = $4`,
      [closed_by ?? null, close_reason, JSON.stringify(snapshot), sessionId]
    );

    if (tableIds.length > 0) {
      await client.query(
        `UPDATE tables
         SET status = 'free',
             occupied_since = NULL,
             active_item_count = 0,
             is_bill_paid = false
         WHERE table_id = ANY($1::uuid[])`,
        [tableIds]
      );
      await client.query(`DELETE FROM session_tables WHERE session_id = $1`, [sessionId]);
    }

    await client.query(
      `INSERT INTO session_events (
        session_id, event_type, timestamp, metadata, performed_by, source_device, source_channel
      ) VALUES ($1, 'SESSION_ABANDONED', NOW(), $2, $3, $4, $5)`,
      [
        sessionId,
        JSON.stringify({ close_type: 'abandoned', reason: close_reason }),
        closed_by ?? null,
        req.header('x-device') ?? 'POS_TERMINAL',
        session.source_type
      ]
    );

    const responseBody = { message: 'Session marked abandoned. Tables freed and logged.', snapshot };
    await saveIdempotency(client, idempotencyKey, 200, responseBody);

    await client.query('COMMIT');
    res.json(responseBody);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to abandon session:', error);
    res.status(500).json({ message: 'Failed to abandon session.' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /sessions/:sessionId — Fetch a session by ID with all mapped tables
// ─────────────────────────────────────────────────────────────────────────────
sessionsRouter.get('/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  try {
    const result = await pool.query(
      `SELECT ts.*,
              t.table_number AS primary_table_number,
              (
                SELECT json_agg(json_build_object(
                  'table_id', st.table_id,
                  'table_number', tbl.table_number
                ))
                FROM session_tables st
                JOIN tables tbl ON tbl.table_id = st.table_id
                WHERE st.session_id = ts.session_id
              ) AS mapped_tables,
              (
                SELECT COUNT(*) FROM orders o WHERE o.session_id = ts.session_id
              )::int AS order_count,
              (
                SELECT COUNT(*) FROM kots k WHERE k.session_id = ts.session_id
              )::int AS kot_count
       FROM table_sessions ts
       JOIN tables t ON t.table_id = ts.table_id
       WHERE ts.session_id = $1`,
      [sessionId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ message: 'Session not found.' });
      return;
    }
    res.json(result.rows[0]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch session.';
    res.status(500).json({ message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /sessions/:sessionId/events — Full event timeline for a session
// ─────────────────────────────────────────────────────────────────────────────
sessionsRouter.get('/:sessionId/events', async (req, res) => {
  const { sessionId } = req.params;
  try {
    const result = await pool.query(
      `SELECT se.event_id, se.event_type, se.timestamp, se.metadata,
              se.source_device, se.source_channel,
              u.display_name AS performed_by_name
       FROM session_events se
       LEFT JOIN users u ON u.id = se.performed_by
       WHERE se.session_id = $1
       ORDER BY se.timestamp ASC`,
      [sessionId]
    );
    res.json({ session_id: sessionId, events: result.rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch session events.';
    res.status(500).json({ message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /sessions/:sessionId/reopen — Reopen a billed session back to active
// State machine: billed → active only (admin override, e.g., item added after bill)
// ─────────────────────────────────────────────────────────────────────────────
sessionsRouter.patch('/:sessionId/reopen', async (req, res) => {
  const { sessionId } = req.params;
  const { performed_by, reason } = req.body;

  if (!reason || reason.trim().length === 0) {
    res.status(400).json({ message: 'reason is required to reopen a session.' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the session row
    const sessionRes = await client.query(
      `SELECT session_id, status, source_type, is_payment_locked FROM table_sessions WHERE session_id = $1 FOR UPDATE`,
      [sessionId]
    );
    if (sessionRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Session not found.' });
      return;
    }
    const session = sessionRes.rows[0];

    // State machine: only billed sessions can be reopened
    if (session.status !== 'billed') {
      await client.query('ROLLBACK');
      res.status(422).json({
        message: `Cannot reopen session in state '${session.status}'. Only 'billed' sessions may be reopened.`
      });
      return;
    }

    // Safety: do not reopen if payment is already locked/processing
    if (session.is_payment_locked) {
      await client.query('ROLLBACK');
      res.status(422).json({ message: 'Session is locked for payment. Cannot reopen.' });
      return;
    }

    // Transition: billed → active
    await client.query(
      `UPDATE table_sessions
       SET status = 'active',
           last_activity_at = NOW(),
           version = version + 1
       WHERE session_id = $1`,
      [sessionId]
    );

    // Event log
    await client.query(
      `INSERT INTO session_events (
        session_id, event_type, timestamp, metadata, performed_by, source_device, source_channel
      ) VALUES ($1, 'SESSION_REOPENED', NOW(), $2, $3, $4, $5)`,
      [
        sessionId,
        JSON.stringify({ previous_status: 'billed', reason }),
        performed_by ?? null,
        req.header('x-device') ?? 'POS_TERMINAL',
        session.source_type,
      ]
    );

    await client.query('COMMIT');
    res.json({ message: 'Session successfully reopened to active state.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to reopen session:', error);
    res.status(500).json({ message: 'Failed to reopen session.' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /sessions/stale — Find sessions that have exceeded their heartbeat timeout
// Used by a future dead-session recovery cron job
// ─────────────────────────────────────────────────────────────────────────────
sessionsRouter.get('/admin/stale', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ts.session_id, ts.session_code, ts.status,
              ts.last_activity_at, ts.heartbeat_timeout,
              t.table_number,
              EXTRACT(EPOCH FROM (NOW() - ts.last_activity_at))::int AS idle_seconds
       FROM table_sessions ts
       JOIN tables t ON t.table_id = ts.table_id
       WHERE ts.status IN ('active', 'billed', 'payment_pending')
         AND EXTRACT(EPOCH FROM (NOW() - ts.last_activity_at)) > ts.heartbeat_timeout
       ORDER BY ts.last_activity_at ASC`
    );
    res.json({ stale_sessions: result.rows, count: result.rows.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch stale sessions.';
    res.status(500).json({ message });
  }
});
