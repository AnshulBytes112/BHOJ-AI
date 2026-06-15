/**
 * table-management.ts
 *
 * Shared business logic for the Table Management Workflow.
 * This module is the SINGLE SOURCE OF TRUTH for table-freeing decisions.
 *
 * CORE BUSINESS RULE:
 *   A table can be freed ONLY IF:
 *     1. All bills associated with the table are fully PAID
 *     AND
 *     2. No KOT item remains in any ACTIVE state
 *        (PENDING, PREPARING, READY, PACKED, RECOOK_REQUESTED)
 *
 * Active item states  → table CANNOT be freed
 * Completed states    → SERVED, DELIVERED, CANCELLED
 */

import { Pool, PoolClient } from 'pg';

// ─── Constants ───────────────────────────────────────────────────────────────

export const ACTIVE_ITEM_STATUSES = [
  'pending',
  'preparing',
  'ready',
  'packed',
  'recook_requested',
] as const;

export const COMPLETED_ITEM_STATUSES = [
  'served',
  'delivered',
  'cancelled',
] as const;

export const ACTIVE_SESSION_STATUSES = [
  'active',
  'billed',
  'payment_pending',
  'payment_done',
  'waiting_service_completion',
  'ready_to_close',
] as const;

export type TableStatus =
  | 'free'
  | 'occupied'
  | 'billing_done'
  | 'waiting_for_service_completion'
  | 'ready_to_free';

export type TableVisualState =
  | 'FREE'                              // No active session
  | 'OCCUPIED_ACTIVE'                   // Customer dining normally (active session, items being prepared/served)
  | 'PAYMENT_DONE_WAITING_SERVICE'      // Payment complete but items still pending (customer paid, waiting for food)
  | 'BILLING_IN_PROGRESS'               // Bill generated, awaiting payment
  | 'READY_TO_CLEAN'                    // All done, waiting for waiter cleanup
  | 'FORCE_ATTENTION';                  // Error state or requires admin attention

// ─── Audit Log Helper ─────────────────────────────────────────────────────────

export async function auditLog(
  client: PoolClient | Pool,
  action: string,
  opts: {
    entityType?: string;
    entityId?: string;
    userId?: number | null;
    tableId?: string | null;
    reason?: string;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<void> {
  try {
    await (client as any).query(
      `INSERT INTO audit_log
         (action, entity_type, entity_id, user_id, table_id, reason, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        action,
        opts.entityType ?? null,
        opts.entityId ?? null,
        opts.userId ?? null,
        opts.tableId ?? null,
        opts.reason ?? null,
        opts.metadata ? JSON.stringify(opts.metadata) : null,
      ]
    );
  } catch (err: any) {
    // Audit failures must NEVER crash the main flow.
    console.error('auditLog write failed (non-fatal):', err.message);
  }
}

// ─── canCloseSession ──────────────────────────────────────────────────────────

export interface CanCloseSessionResult {
  canClose: boolean;
  reason: string;
  activeItemCount: number;
  unpaidBillCount: number;
  billsPaid: boolean;
  allItemsComplete: boolean;
}

/**
 * canCloseSession — validates whether a session can be closed cleanly.
 */
export async function canCloseSession(
  client: PoolClient,
  sessionId: string
): Promise<CanCloseSessionResult> {
  // 1. Check all bills for this session are paid
  const billsResult = await client.query(
    `SELECT
       COUNT(*)                                       AS total_bills,
       COUNT(*) FILTER (WHERE payment_status = 'paid') AS paid_bills
     FROM bills
     WHERE session_id = $1
    `,
    [sessionId]
  );
  const totalBills = parseInt(billsResult.rows[0].total_bills, 10);
  const paidBills = parseInt(billsResult.rows[0].paid_bills, 10);
  const unpaidBillCount = totalBills - paidBills;
  const unpaidItemsResult = await client.query(
    `SELECT COUNT(DISTINCT oi.order_item_id) AS billable_item_count
     FROM order_items oi
     JOIN orders o ON o.order_id = oi.order_id
     LEFT JOIN kots k ON k.order_id = o.order_id
     LEFT JOIN kot_items ki ON ki.kot_id = k.kot_id AND ki.item_id = oi.item_id
     LEFT JOIN section_kots sk ON sk.parent_kot_id = k.kot_id
     LEFT JOIN section_kot_items ski ON ski.section_kot_id = sk.section_kot_id AND ski.item_id = oi.item_id
     WHERE o.session_id = $1
       AND oi.billing_status = 'UNBILLED'
       AND o.status <> 'cancelled'
       AND COALESCE(ki.status, '') <> 'cancelled'
       AND COALESCE(ski.status, '') <> 'cancelled'`,
    [sessionId]
  );
  const billableItemCount = parseInt(unpaidItemsResult.rows[0].billable_item_count, 10);
  const billsPaid = totalBills > 0 && totalBills === paidBills;

  // 2. Fetch all KOT items for this session
  const itemsResult = await client.query(
    `SELECT ski.status
     FROM section_kot_items ski
     JOIN section_kots sk ON sk.section_kot_id = ski.section_kot_id
     JOIN kots k          ON k.kot_id          = sk.parent_kot_id
     WHERE k.session_id = $1
     FOR SHARE`,
    [sessionId]
  );

  let activeItemCount = 0;
  for (const row of itemsResult.rows) {
    if (ACTIVE_ITEM_STATUSES.includes(row.status as any)) {
      activeItemCount++;
    }
  }
  const allItemsComplete = activeItemCount === 0;

  if (!billsPaid && billableItemCount > 0) {
    return {
      canClose: false,
      reason: totalBills === 0
        ? 'Billable items remain for this session. Generate and settle the bill before freeing it.'
        : `${unpaidBillCount} unpaid bill(s) remain for this session.`,
      activeItemCount,
      unpaidBillCount,
      billsPaid: false,
      allItemsComplete,
    };
  }

  if (!allItemsComplete) {
    return {
      canClose: false,
      reason: `Active kitchen items remain: ${activeItemCount} item(s) are still preparing.`,
      activeItemCount,
      unpaidBillCount,
      billsPaid: true,
      allItemsComplete: false,
    };
  }

  return {
    canClose: true,
    reason: totalBills === 0
      ? 'Only cancelled or non-billable items remain. Table can be freed.'
      : 'All bills paid and all items complete.',
    activeItemCount: 0,
    unpaidBillCount: 0,
    billsPaid: billsPaid || billableItemCount === 0,
    allItemsComplete: true,
  };
}

// ─── canFreeTable ─────────────────────────────────────────────────────────────

export interface CanFreeTableResult {
  canFree: boolean;
  reason: string;
  pendingCount: number;
  preparingCount: number;
  readyCount: number;
  packedCount: number;
  recookCount: number;
  activeItemCount: number;
  unpaidBillCount: number;
  billsPaid: boolean;
  allItemsComplete: boolean;
}

/**
 * canFreeTable — validates whether a table can be freed.
 *
 * Uses session checks to keep full restaurant session integrity.
 */
export async function canFreeTable(
  client: PoolClient,
  tableId: string,
  occupiedSince: Date | null = null
): Promise<CanFreeTableResult> {
  // Find the active session for this table (including merges)
  const sessionQuery = await client.query(
     `SELECT ts.session_id FROM table_sessions ts
     LEFT JOIN session_tables st ON ts.session_id = st.session_id
     WHERE (ts.table_id = $1 OR st.table_id = $1)
       AND ts.status = ANY($2::text[])
     LIMIT 1`,
    [tableId, ACTIVE_SESSION_STATUSES]
  );

  if (sessionQuery.rows.length === 0) {
    const legacyBillsResult = await client.query(
      `SELECT
         COUNT(*) AS total_bills,
         COUNT(*) FILTER (WHERE payment_status = 'paid') AS paid_bills
       FROM bills
       WHERE table_id = $1
         AND ($2::timestamp IS NULL OR created_at >= $2::timestamp)
      `,
      [tableId, occupiedSince]
    );

    const legacyItemsResult = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE ski.status = 'pending') AS pending_count,
         COUNT(*) FILTER (WHERE ski.status = 'preparing') AS preparing_count,
         COUNT(*) FILTER (WHERE ski.status = 'ready') AS ready_count,
         COUNT(*) FILTER (WHERE ski.status = 'packed') AS packed_count,
         COUNT(*) FILTER (WHERE ski.status = 'recook_requested') AS recook_count
       FROM kots k
       JOIN section_kots sk ON sk.parent_kot_id = k.kot_id
       JOIN section_kot_items ski ON ski.section_kot_id = sk.section_kot_id
       WHERE k.table_id = $1
         AND ($2::timestamp IS NULL OR k.generated_at >= $2::timestamp)
      `,
      [tableId, occupiedSince]
    );

    const legacyBillableItemsResult = await client.query(
      `SELECT COUNT(DISTINCT oi.order_item_id) AS billable_item_count
       FROM order_items oi
       JOIN orders o ON o.order_id = oi.order_id
       LEFT JOIN kots k ON k.order_id = o.order_id
       LEFT JOIN kot_items ki ON ki.kot_id = k.kot_id AND ki.item_id = oi.item_id
       LEFT JOIN section_kots sk ON sk.parent_kot_id = k.kot_id
       LEFT JOIN section_kot_items ski ON ski.section_kot_id = sk.section_kot_id AND ski.item_id = oi.item_id
       WHERE o.table_id = $1
         AND ($2::timestamp IS NULL OR o.created_at >= $2::timestamp)
         AND oi.billing_status = 'UNBILLED'
         AND o.status <> 'cancelled'
         AND COALESCE(ki.status, '') <> 'cancelled'
         AND COALESCE(ski.status, '') <> 'cancelled'`,
      [tableId, occupiedSince]
    );

    const totalBills = parseInt(legacyBillsResult.rows[0].total_bills, 10);
    const paidBills = parseInt(legacyBillsResult.rows[0].paid_bills, 10);
    const pendingCount = parseInt(legacyItemsResult.rows[0].pending_count ?? '0', 10);
    const preparingCount = parseInt(legacyItemsResult.rows[0].preparing_count ?? '0', 10);
    const readyCount = parseInt(legacyItemsResult.rows[0].ready_count ?? '0', 10);
    const packedCount = parseInt(legacyItemsResult.rows[0].packed_count ?? '0', 10);
    const recookCount = parseInt(legacyItemsResult.rows[0].recook_count ?? '0', 10);
    const activeItemCount = pendingCount + preparingCount + readyCount + packedCount + recookCount;
    const unpaidBillCount = totalBills - paidBills;
    const billableItemCount = parseInt(legacyBillableItemsResult.rows[0].billable_item_count, 10);
    const billsPaid = totalBills > 0 && unpaidBillCount === 0;
    const allItemsComplete = activeItemCount === 0;

    if (totalBills === 0 && billableItemCount > 0) {
      return {
        canFree: false,
        reason: 'No bill has been generated for this table. Generate and settle the bill before freeing it.',
        pendingCount, preparingCount, readyCount, packedCount, recookCount,
        activeItemCount, unpaidBillCount: 0, billsPaid: false, allItemsComplete,
      };
    }

    if ((!billsPaid && billableItemCount > 0) || !allItemsComplete) {
      return {
        canFree: false,
        reason: !billsPaid && billableItemCount > 0
          ? `${unpaidBillCount || totalBills || 1} unpaid bill(s) remain for this table.`
          : `Active kitchen items remain: ${activeItemCount} item(s) are still preparing.`,
        pendingCount, preparingCount, readyCount, packedCount, recookCount,
        activeItemCount, unpaidBillCount, billsPaid, allItemsComplete,
      };
    }

    return {
      canFree: true,
      reason: 'No active session found for this table.',
      pendingCount: 0, preparingCount: 0, readyCount: 0, packedCount: 0, recookCount: 0,
      activeItemCount: 0,
      unpaidBillCount: 0,
      billsPaid: billsPaid || billableItemCount === 0,
      allItemsComplete: true,
    };
  }

  const session = sessionQuery.rows[0];
  const validation = await canCloseSession(client, session.session_id);

  return {
    canFree: validation.canClose,
    reason: validation.reason,
    pendingCount: 0, preparingCount: 0, readyCount: 0, packedCount: 0, recookCount: 0,
    activeItemCount: validation.activeItemCount,
    unpaidBillCount: validation.unpaidBillCount,
    billsPaid: validation.billsPaid,
    allItemsComplete: validation.allItemsComplete,
  };
}

// ─── deriveTableStatus ────────────────────────────────────────────────────────

/**
 * Computes the correct table status given billing and item state.
 * Does NOT write to DB — the caller is responsible for persisting.
 */
export function deriveTableStatus(
  billsPaid: boolean,
  activeItemCount: number,
  hasAnyBill: boolean
): TableStatus {
  if (activeItemCount > 0) return 'waiting_for_service_completion'; // Priority: food is cooking
  if (!hasAnyBill) return 'occupied';           // no bill yet, just occupied
  if (!billsPaid)  return 'billing_done';       // bill generated but not paid
  return 'ready_to_free';
}

// ─── Fetch Active Session Info ────────────────────────────────────────────────

export interface SessionState {
  session_id: string | null;
  session_status: string | null;
  payment_status: string | null;
  payment_done: boolean;
  active_item_count: number;
  unpaid_bill_count: number;
  has_active_kot_items: boolean;
}

/**
 * Fetches the active session and its state for a table.
 * Returns null if no active session exists.
 */
export async function fetchSessionState(
  client: PoolClient,
  tableId: string
): Promise<SessionState> {
  // Get active session for this table
  const sessionQuery = await client.query(
     `SELECT ts.session_id, ts.status as session_status, ts.payment_status
     FROM table_sessions ts
     LEFT JOIN session_tables st ON ts.session_id = st.session_id
     WHERE (ts.table_id = $1 OR st.table_id = $1)
       AND ts.status = ANY($2::text[])
     LIMIT 1`,
    [tableId, ACTIVE_SESSION_STATUSES]
  );

  if (sessionQuery.rows.length === 0) {
    return {
      session_id: null,
      session_status: null,
      payment_status: null,
      payment_done: false,
      active_item_count: 0,
      unpaid_bill_count: 0,
      has_active_kot_items: false,
    };
  }

  const session = sessionQuery.rows[0];

  // Count unpaid bills in this session
  const billsQuery = await client.query(
    `SELECT COUNT(*) FILTER (WHERE payment_status = 'unpaid') as unpaid_count
     FROM bills
     WHERE session_id = $1`,
    [session.session_id]
  );
  const unpaidBillCount = parseInt(billsQuery.rows[0].unpaid_count, 10);

  // Check for active KOT items in this session
  const kotsQuery = await client.query(
    `SELECT COUNT(*) as active_count
     FROM section_kot_items ski
     JOIN section_kots sk ON sk.section_kot_id = ski.section_kot_id
     JOIN kots k ON k.kot_id = sk.parent_kot_id
     WHERE k.session_id = $1
       AND ski.status IN ('pending', 'preparing', 'ready', 'packed', 'recook_requested')`,
    [session.session_id]
  );
  const activeItemCount = parseInt(kotsQuery.rows[0].active_count, 10);

  return {
    session_id: session.session_id,
    session_status: session.session_status,
    payment_status: session.payment_status,
    payment_done: session.payment_status === 'paid' || session.session_status === 'payment_done',
    active_item_count: activeItemCount,
    unpaid_bill_count: unpaidBillCount,
    has_active_kot_items: activeItemCount > 0,
  };
}

// ─── Derive Table Visual State ────────────────────────────────────────────────

/**
 * Derives the UI visual state for a table based on its session lifecycle.
 * This is the SINGLE SOURCE OF TRUTH for table display state.
 *
 * Logic:
 *   - if no active session → FREE
 *   - else if payment_done AND has_active_kot_items → PAYMENT_DONE_WAITING_SERVICE
 *   - else if active_kot_exists → OCCUPIED_ACTIVE
 *   - else if session.completed → READY_TO_CLEAN
 *   - else if billing_in_progress → BILLING_IN_PROGRESS
 *   - else → OCCUPIED_ACTIVE (default dining state)
 */
export function deriveTableVisualState(session: SessionState): TableVisualState {
  // No active session → FREE
  if (!session.session_id) {
    return 'FREE';
  }

  // Payment complete + items still pending → Customer paid but waiting for food
  if (session.payment_done && session.has_active_kot_items) {
    return 'PAYMENT_DONE_WAITING_SERVICE';
  }

  // Active items being prepared/served → Normal dining
  if (session.has_active_kot_items) {
    return 'OCCUPIED_ACTIVE';
  }

  // Session is in payment/completed state but no items active
  if (session.session_status === 'payment_done' || session.session_status === 'ready_to_close') {
    return 'READY_TO_CLEAN';
  }

  // Bill generated, awaiting payment
  if (session.session_status === 'billed' || session.session_status === 'payment_pending') {
    return 'BILLING_IN_PROGRESS';
  }

  // Active session, dining normally
  return 'OCCUPIED_ACTIVE';
}

// ─── tryAutoFreeTable ─────────────────────────────────────────────────────────

/**
 * Called after any KOT item status change or payment event.
 * Atomically validates and, if canFreeTable passes, sets status = 'free'.
 *
 * Returns the new table status.
 */
export async function tryAutoFreeTable(
  pool: Pool,
  tableId: string,
  triggeredBy: string = 'system'
): Promise<{ freed: boolean; newStatus: string; validation: CanFreeTableResult }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the table row to prevent concurrent free attempts (EC-9).
    const tableRow = await client.query(
      `SELECT table_id, status, occupied_since FROM tables WHERE table_id = $1 FOR UPDATE`,
      [tableId]
    );
    if (tableRow.rows.length === 0) {
      await client.query('ROLLBACK');
      return { freed: false, newStatus: 'unknown', validation: {
        canFree: false, reason: 'Table not found', pendingCount: 0,
        preparingCount: 0, readyCount: 0, packedCount: 0, recookCount: 0,
        activeItemCount: 0, unpaidBillCount: 0, billsPaid: false,
        allItemsComplete: false,
      }};
    }

    const validation = await canFreeTable(client, tableId, tableRow.rows[0].occupied_since);

    let newStatus: string = tableRow.rows[0].status;
    const isManualTrigger = triggeredBy.startsWith('user:');

    if (validation.canFree && isManualTrigger) {
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
        const sessionIds = Array.from(new Set(sessionsToClose.rows.map(row => row.session_id)));
        await client.query(
          `UPDATE table_sessions
           SET status = 'completed',
               payment_status = 'paid',
               ended_at = COALESCE(ended_at, NOW()),
               last_activity_at = NOW(),
               version = version + 1
           WHERE session_id = ANY($1::uuid[])`,
          [sessionIds]
        );

        for (const sessionId of sessionIds) {
          await client.query(
            `INSERT INTO session_events (session_id, event_type, timestamp, metadata, source_device, source_channel)
             VALUES ($1, 'SESSION_COMPLETED', NOW(), $2, 'SYSTEM', $3)`,
            [sessionId, JSON.stringify({ table_id: tableId, triggered_by: triggeredBy }), triggeredBy]
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
      newStatus = 'free';

      await auditLog(client, 'TABLE_FREED', {
        entityType: 'table',
        entityId: tableId,
        tableId,
        reason: `Manual free by ${triggeredBy}`,
        metadata: { validation },
      });
      
      await client.query('COMMIT');
      return { freed: true, newStatus: 'free', validation };
    } else {
      // Derive and persist the correct intermediate status
      const hasAnyBill = validation.unpaidBillCount > 0 || validation.billsPaid === true;
      const derived = deriveTableStatus(
        validation.billsPaid,
        validation.activeItemCount,
        hasAnyBill
      );

      // System trigger or not ready to free:
      // If validation.canFree is true, it is ready to free but hasn't been manually freed.
      const statusToSet = (validation.canFree && !isManualTrigger) ? 'ready_to_free' : derived;

      await client.query(
        `UPDATE tables
         SET status = $1,
             active_item_count = $2
         WHERE table_id = $3`,
        [statusToSet, validation.activeItemCount, tableId]
      );
      newStatus = statusToSet;
    }

    await client.query('COMMIT');
    return { freed: false, newStatus, validation };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
