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

export type TableStatus =
  | 'free'
  | 'occupied'
  | 'billing_done'
  | 'waiting_for_service_completion'
  | 'ready_to_free';

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
 * Uses a single transaction-scoped query with FOR SHARE row-level locking
 * on the relevant rows to prevent race conditions (EC-9).
 *
 * @param client  A PoolClient (within an active transaction) to ensure atomicity.
 * @param tableId The UUID of the table to validate.
 */
export async function canFreeTable(
  client: PoolClient,
  tableId: string
): Promise<CanFreeTableResult> {
  // ── Step 1: Check all bills for this table are PAID ───────────────────────
  //    Edge Case 4 (Split Billing): ALL bills must be paid.
  const billsResult = await client.query(
    `SELECT
       COUNT(*)                                       AS total_bills,
       COUNT(*) FILTER (WHERE payment_status = 'paid') AS paid_bills
     FROM bills
     WHERE table_id = $1
     FOR SHARE`,
    [tableId]
  );

  const totalBills = parseInt(billsResult.rows[0].total_bills, 10);
  const paidBills  = parseInt(billsResult.rows[0].paid_bills, 10);

  // If there are no bills at all, treat as unpaid (table not yet billed).
  const billsPaid = totalBills > 0 && totalBills === paidBills;
  const unpaidBillCount = totalBills - paidBills;

  if (!billsPaid) {
    return {
      canFree: false,
      reason: unpaidBillCount > 0
        ? `${unpaidBillCount} unpaid bill(s) remain for this table.`
        : 'No bills found for this table.',
      pendingCount: 0, preparingCount: 0, readyCount: 0,
      packedCount: 0,  recookCount: 0,   activeItemCount: 0,
      unpaidBillCount,
      billsPaid: false,
      allItemsComplete: false,
    };
  }

  // ── Step 2: Fetch ALL KOT item statuses across ALL KOTs for this table ────
  //    Edge Case 3 (Multiple KOTs): query crosses all parent kots + all
  //    section_kot_items so that not a single item is missed.
  //    We lock the rows for share to prevent concurrent kitchen updates
  //    from racing with this check (EC-9).
  const itemsResult = await client.query(
    `SELECT ski.status
     FROM section_kot_items ski
     JOIN section_kots sk  ON sk.section_kot_id = ski.section_kot_id
     JOIN kots k           ON k.kot_id          = sk.parent_kot_id
     WHERE k.table_id = $1
     FOR SHARE`,
    [tableId]
  );

  // Count active statuses
  let pendingCount   = 0;
  let preparingCount = 0;
  let readyCount     = 0;
  let packedCount    = 0;
  let recookCount    = 0;

  for (const row of itemsResult.rows) {
    switch (row.status) {
      case 'pending':           pendingCount++;   break;
      case 'preparing':         preparingCount++; break;
      case 'ready':             readyCount++;     break;
      case 'packed':            packedCount++;    break;
      case 'recook_requested':  recookCount++;    break;
    }
  }

  const activeItemCount = pendingCount + preparingCount + readyCount + packedCount + recookCount;
  const allItemsComplete = activeItemCount === 0;

  if (!allItemsComplete) {
    const details: string[] = [];
    if (pendingCount)   details.push(`${pendingCount} pending`);
    if (preparingCount) details.push(`${preparingCount} preparing`);
    if (readyCount)     details.push(`${readyCount} ready`);
    if (packedCount)    details.push(`${packedCount} packed`);
    if (recookCount)    details.push(`${recookCount} recook-requested`);

    return {
      canFree: false,
      reason: `Active KOT items remain: ${details.join(', ')}.`,
      pendingCount, preparingCount, readyCount, packedCount, recookCount,
      activeItemCount,
      unpaidBillCount: 0,
      billsPaid: true,
      allItemsComplete: false,
    };
  }

  return {
    canFree: true,
    reason: 'All bills paid and all items completed.',
    pendingCount: 0, preparingCount: 0, readyCount: 0,
    packedCount: 0,  recookCount: 0,   activeItemCount: 0,
    unpaidBillCount: 0,
    billsPaid: true,
    allItemsComplete: true,
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
  if (!hasAnyBill) return 'occupied';           // no bill yet, just occupied
  if (!billsPaid)   return 'billing_done';       // bill generated but not paid
  if (activeItemCount > 0) return 'waiting_for_service_completion';
  return 'ready_to_free';
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
      `SELECT table_id, status FROM tables WHERE table_id = $1 FOR UPDATE`,
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

    const validation = await canFreeTable(client, tableId);

    let newStatus: string = tableRow.rows[0].status;

    if (validation.canFree) {
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

      await auditLog(client, 'TABLE_AUTO_FREED', {
        entityType: 'table',
        entityId: tableId,
        tableId,
        reason: `Auto-freed by ${triggeredBy}`,
        metadata: { validation },
      });
    } else {
      // Derive and persist the correct intermediate status
      const hasAnyBill = validation.unpaidBillCount >= 0 && validation.billsPaid !== false;
      const derived = deriveTableStatus(
        validation.billsPaid,
        validation.activeItemCount,
        validation.billsPaid || validation.unpaidBillCount > 0
      );

      await client.query(
        `UPDATE tables
         SET status = $1,
             active_item_count = $2
         WHERE table_id = $3`,
        [derived, validation.activeItemCount, tableId]
      );
      newStatus = derived;
    }

    await client.query('COMMIT');
    return { freed: validation.canFree, newStatus, validation };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
