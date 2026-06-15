import { Router } from 'express';
import { pool } from '../db';
import { tryAutoFreeTable, auditLog, ACTIVE_ITEM_STATUSES } from '../tables/table-management';
import { broadcastToTable } from '../websocket';

export const kotsRouter = Router();

// ─────────────────────────────────────────────────────────────────────────
// ITEM-CENTRIC KOT WORKFLOW: Item Status Transition Validation & Derivation
// ─────────────────────────────────────────────────────────────────────────

/**
 * ITEM STATUS TRANSITION RULES
 * Each item state can only transition to specific next states.
 * This ensures kitchen workflow correctness.
 */
const ITEM_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending:              ['acknowledged', 'cancelled'],
  acknowledged:         ['preparing', 'cancelled'],
  preparing:            ['ready', 'recook_requested', 'cancelled'],
  ready:                ['served', 'delivered', 'recook_requested'],
  served:               [],  // Terminal state
  delivered:            [],  // Terminal state
  cancelled:            [],  // Terminal state
  recook_requested:     ['preparing'],
  packed:               ['served', 'delivered'],
};

const TERMINAL_KOT_STATUSES = ['completed', 'served'];
const ACTIVE_KOT_ITEM_STATUSES = ['pending', 'acknowledged', 'preparing', 'ready', 'packed', 'recook_requested'];

/**
 * Validates if a status transition is allowed.
 */
function isValidItemStatusTransition(currentStatus: string, newStatus: string): boolean {
  const allowedTransitions = ITEM_STATUS_TRANSITIONS[currentStatus] || [];
  return allowedTransitions.includes(newStatus);
}

/**
 * Gets the appropriate timestamp column name for a status change.
 */
function getTimestampColumnForStatus(status: string): string | null {
  const timestampMap: Record<string, string> = {
    acknowledged:      'acknowledged_at',
    preparing:         'preparing_at',
    ready:             'ready_at',
    served:            'served_at',
    cancelled:         'cancelled_at',
    delivered:         'delivered_at',
    recook_requested:  'recook_requested_at',
  };
  return timestampMap[status] || null;
}

/**
 * Derives the KOT status from all its items' statuses.
 * This is the authoritative logic for KOT status computation.
 */
function deriveKotStatusFromItems(itemStatuses: string[]): string {
  if (itemStatuses.length === 0) return 'pending';
  
  const allCancelled = itemStatuses.every(s => s === 'cancelled');
  if (allCancelled) return 'cancelled';
  
  const allTerminal = itemStatuses.every(s => ['served', 'delivered', 'cancelled'].includes(s));
  if (allTerminal) return 'completed';
  
  const allReady = itemStatuses.every(s => ['ready', 'served', 'delivered', 'cancelled'].includes(s));
  if (allReady) return 'ready';
  
  const someActive = itemStatuses.some(s => ['preparing', 'acknowledged'].includes(s));
  if (someActive) return 'acknowledged';
  
  const allPending = itemStatuses.every(s => s === 'pending');
  if (allPending) return 'pending';
  
  return 'acknowledged'; // Mixed states = in progress
}

function deriveParentKotStatusFromSections(sectionStatuses: string[]): string {
  if (sectionStatuses.length === 0) return 'pending';

  const allCancelled = sectionStatuses.every(s => s === 'cancelled');
  if (allCancelled) return 'cancelled';

  if (sectionStatuses.every(s => s === 'completed' || s === 'served' || s === 'cancelled')) {
    return 'completed';
  }

  if (sectionStatuses.every(s => ['ready', 'completed', 'served', 'cancelled'].includes(s))) {
    return 'ready';
  }

  if (sectionStatuses.some(s => s === 'acknowledged' || s === 'ready' || s === 'completed')) {
    return 'acknowledged';
  }

  return 'pending';
}

function deriveOrderStatusFromParentKots(kotStatuses: string[]): string {
  if (kotStatuses.length === 0) return 'sent_to_kitchen';

  const allCancelled = kotStatuses.every(s => s === 'cancelled');
  if (allCancelled) return 'cancelled';

  if (kotStatuses.every(s => s === 'completed' || s === 'served' || s === 'cancelled')) {
    return 'completed';
  }

  if (kotStatuses.every(s => ['ready', 'completed', 'served', 'cancelled'].includes(s))) {
    return 'ready';
  }

  if (kotStatuses.some(s => s === 'acknowledged' || s === 'ready' || s === 'completed')) {
    return 'preparing';
  }

  return 'sent_to_kitchen';
}

// GET /kots — list all KOTs with is_bill_paid flag (for "Customer Already Paid" banner)
kotsRouter.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT k.kot_id, k.order_id, k.order_phase,
              k.kot_number, k.status, k.generated_at,
              k.order_type, k.payment_option, k.notes,
              COALESCE(curr_tbl.table_number, k.table_number) as table_number,
              COALESCE(curr_tbl.table_id, k.table_id) as table_id,
              t.is_bill_paid
       FROM kots k
       LEFT JOIN tables t ON t.table_id = k.table_id
       LEFT JOIN table_sessions ts ON ts.session_id = k.session_id
       LEFT JOIN tables curr_tbl ON curr_tbl.table_id = ts.table_id
       WHERE k.status <> ALL($1::kot_status[])
       ORDER BY k.generated_at DESC`,
      [TERMINAL_KOT_STATUSES]
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /kots error:', err);
    res.status(500).json({ message: 'Failed to fetch KOTs' });
  }
});


kotsRouter.get('/sections/list', async (req, res) => {
  try {
    try {
      const result = await pool.query(
        `SELECT c.name as section_id, c.name as section_name,
                COALESCE(COUNT(sk.section_kot_id) FILTER (
                  WHERE sk.status <> ALL($1::kot_status[])
                    AND EXISTS (
                      SELECT 1 FROM section_kot_items ski
                      WHERE ski.section_kot_id = sk.section_kot_id
                        AND ski.status = ANY($2::text[])
                    )
                ), 0) as pending_count
         FROM categories c
         LEFT JOIN section_kots sk ON sk.section_name = c.name
         WHERE c.is_active = true
         GROUP BY c.name ORDER BY c.name`,
        [TERMINAL_KOT_STATUSES, ACTIVE_KOT_ITEM_STATUSES]
      );
      if (result.rows.length > 0) {
        return res.json(result.rows);
      }
    } catch (sqlErr: any) {
      console.error('sections/list primary query failed:', sqlErr.message);
    }

    // Second try: just get categories without KOT counts
    try {
      const catResult = await pool.query(
        `SELECT name as section_id, name as section_name, '0' as pending_count
         FROM categories WHERE is_active = true ORDER BY name`
      );
      if (catResult.rows.length > 0) {
        return res.json(catResult.rows);
      }
    } catch (catErr: any) {
      console.error('sections/list categories fallback failed:', catErr.message);
    }

    // Third try: pull from existing section_kots
    try {
      const fallback = await pool.query(
        `SELECT DISTINCT section_name as section_id, section_name,
                COUNT(*) FILTER (
                  WHERE sk.status <> ALL($1::kot_status[])
                    AND EXISTS (
                      SELECT 1 FROM section_kot_items ski
                      WHERE ski.section_kot_id = sk.section_kot_id
                        AND ski.status = ANY($2::text[])
                    )
                ) as pending_count
         FROM section_kots sk
         GROUP BY section_name ORDER BY section_name`,
        [TERMINAL_KOT_STATUSES, ACTIVE_KOT_ITEM_STATUSES]
      );
      return res.json(fallback.rows);
    } catch (fbErr: any) {
      console.error('sections/list section_kots fallback failed:', fbErr.message);
    }

    res.json([]);
  } catch (err: any) {
    console.error('GET /kots/sections/list error:', err);
    res.status(500).json({ message: 'Failed to fetch sections' });
  }
});

// GET /kots/section/:sectionId — section KOTs with is_bill_paid flag
kotsRouter.get('/section/:sectionId', async (req, res) => {
  const { sectionId } = req.params;
  try {
    await pool.query(
      `UPDATE section_kots sk
       SET status = 'completed',
           updated_at = CURRENT_TIMESTAMP
       WHERE sk.section_name = $1
         AND sk.status <> ALL($2::kot_status[])
         AND NOT EXISTS (
           SELECT 1
           FROM section_kot_items ski
           WHERE ski.section_kot_id = sk.section_kot_id
             AND ski.status = ANY($3::text[])
         )`,
      [sectionId, TERMINAL_KOT_STATUSES, ACTIVE_KOT_ITEM_STATUSES]
    );

    const skotsResult = await pool.query(
      `SELECT sk.section_kot_id, sk.parent_kot_id, sk.section_id, sk.section_name,
              sk.section_kot_number, sk.status, sk.generated_at,
              sk.section_name AS kitchen_name,
              sk.section_kot_id AS kitchen_kot_id,
              sk.section_kot_number AS kitchen_kot_number,
              COALESCE(curr_tbl.table_number, k.table_number) as table_number,
              k.kot_number, k.kot_number AS parent_kot_number, k.order_phase, k.order_id,
              k.order_type, k.payment_option, k.notes,
              t.is_bill_paid
       FROM section_kots sk
       LEFT JOIN kots k    ON k.kot_id    = sk.parent_kot_id
       LEFT JOIN tables t  ON t.table_id  = k.table_id
       LEFT JOIN table_sessions ts ON ts.session_id = k.session_id
       LEFT JOIN tables curr_tbl ON curr_tbl.table_id = ts.table_id
       WHERE sk.section_name = $1
         AND sk.status <> ALL($2::kot_status[])
         AND EXISTS (
           SELECT 1
           FROM section_kot_items active_ski
           WHERE active_ski.section_kot_id = sk.section_kot_id
             AND active_ski.status = ANY($3::text[])
         )
       ORDER BY sk.generated_at DESC`,
      [sectionId, TERMINAL_KOT_STATUSES, ACTIVE_KOT_ITEM_STATUSES]
    );

    const sectionKots = await Promise.all(
      skotsResult.rows.map(async (skot: { section_kot_id: string }) => {
        const itemsResult = await pool.query(
          `SELECT ski.section_kot_item_id, ski.item_id, ski.item_name,
                  ski.quantity, ski.serial_number, ski.status
           FROM section_kot_items ski WHERE ski.section_kot_id = $1
           ORDER BY ski.created_at ASC`,
          [skot.section_kot_id]
        );
        return { ...skot, items: itemsResult.rows };
      })
    );

    res.json(sectionKots);
  } catch (err: any) {
    console.error('GET /kots/section/:sectionId error:', err);
    res.status(500).json({ message: 'Failed to fetch section KOTs' });
  }
});

// POST /kots/items/:itemId/status — update a single KOT item status with transition validation
// ⭐ ITEM-CENTRIC: Each item updates independently with proper state machine validation
kotsRouter.post('/items/:itemId/status', async (req, res) => {
  const { itemId } = req.params;
  const { status, version } = req.body;
  
  console.log(`\n[KOT-ENDPOINT] POST /items/:itemId/status called with itemId=${itemId}, status=${status}, version=${version}`);

  // Validate new status value
  if (!status || !Object.keys(ITEM_STATUS_TRANSITIONS).includes(status)) {
    console.error(`[KOT-ERROR] Invalid status: ${status}`);
    return res.status(400).json({ 
      message: `Invalid status. Must be one of: ${Object.keys(ITEM_STATUS_TRANSITIONS).join(', ')}` 
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Step 1: Fetch current item with version for optimistic locking
    const itemResult = await client.query(
      `SELECT * FROM section_kot_items WHERE section_kot_item_id = $1`,
      [itemId]
    );
    
    if (itemResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'KOT item not found' });
    }

    const item = itemResult.rows[0];
    const currentStatus = item.status;

    // Step 2: Validate status transition
    if (!isValidItemStatusTransition(currentStatus, status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        message: `Invalid transition: ${currentStatus} → ${status}. Allowed: ${ITEM_STATUS_TRANSITIONS[currentStatus].join(', ')}`
      });
    }

    // Step 3: Check optimistic lock (if version provided)
    if (version !== undefined && item.version !== version) {
      await client.query('ROLLBACK');
      return res.status(409).json({ 
        message: `Version conflict. Expected ${item.version}, got ${version}. Item may have been updated.`
      });
    }

    // Step 4: Build UPDATE query with appropriate timestamp
    const timestampColumn = getTimestampColumnForStatus(status);
    const userIdHeader = req.header('x-user-id');
    const userId = userIdHeader ? parseInt(userIdHeader, 10) : null;

    let updateQuery = `
      UPDATE section_kot_items
      SET status = $1,
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
    `;
    const queryParams: any[] = [status];
    
    if (timestampColumn) {
      updateQuery += `, ${timestampColumn} = CURRENT_TIMESTAMP`;
    }

    if (userId !== null && !isNaN(userId)) {
      updateQuery += `, updated_by = $2`;
      queryParams.push(userId);
    }

    const itemPlaceholder = userId !== null && !isNaN(userId) ? '$3' : '$2';
    updateQuery += ` WHERE section_kot_item_id = ${itemPlaceholder} RETURNING *`;
    queryParams.push(itemId);

    const updateResult = await client.query(updateQuery, queryParams);
    const updatedItem = updateResult.rows[0];

    // Step 4b: Also update the corresponding parent KOT item in the main `kot_items` table
    const parentKotResult = await client.query(
      `SELECT parent_kot_id FROM section_kots WHERE section_kot_id = $1`,
      [item.section_kot_id]
    );
    const parentKotId = parentKotResult.rows[0]?.parent_kot_id;
    
    if (parentKotId) {
      let updateParentQuery = `
        UPDATE kot_items
        SET status = $1,
            version = version + 1,
            updated_at = CURRENT_TIMESTAMP
      `;
      const parentParams: any[] = [status];
      
      if (timestampColumn) {
        updateParentQuery += `, ${timestampColumn} = CURRENT_TIMESTAMP`;
      }
      
      let paramIndex = 2;
      if (userId !== null && !isNaN(userId)) {
        updateParentQuery += `, updated_by = $${paramIndex}`;
        parentParams.push(userId);
        paramIndex++;
      }
      
      if (item.serial_number) {
        updateParentQuery += ` WHERE serial_number = $${paramIndex} AND kot_id = $${paramIndex + 1}`;
        parentParams.push(item.serial_number, parentKotId);
      } else {
        updateParentQuery += ` WHERE item_id = $${paramIndex} AND kot_id = $${paramIndex + 1}`;
        parentParams.push(item.item_id, parentKotId);
      }
      
      await client.query(updateParentQuery, parentParams);
      console.log(`[KOT-DEBUG] Updated parent kot_items for parentKotId=${parentKotId}, serial_number=${item.serial_number}`);
    }

    // Step 5: Fetch all items in this section KOT
    console.log(`[KOT-DEBUG] Looking for items in section_kot_id: ${item.section_kot_id}`);
    const allItemsResult = await client.query(
      `SELECT status FROM section_kot_items WHERE section_kot_id = $1`,
      [item.section_kot_id]
    );
    const itemStatuses = allItemsResult.rows.map((r: any) => r.status);
    console.log(`[KOT-DEBUG] Found ${allItemsResult.rows.length} items. Statuses = [${itemStatuses.join(', ')}]`);

    // Step 6: Derive KOT status from items and update if changed
    const derivedKotStatus = deriveKotStatusFromItems(itemStatuses);
    console.log(`[KOT-DEBUG] Derived KOT status: ${derivedKotStatus}`);
    
    if (!item.section_kot_id) {
      console.error(`[KOT-ERROR] section_kot_id is null/undefined!`);
      await client.query('ROLLBACK');
      return res.status(500).json({ message: 'Section KOT ID is missing' });
    }
    
    let updateSectionKotQuery = `UPDATE section_kots SET status = $1, updated_at = CURRENT_TIMESTAMP`;
    const sectionKotParams: any[] = [derivedKotStatus];
    if (userId !== null && !isNaN(userId)) {
      updateSectionKotQuery += `, updated_by = $2`;
      sectionKotParams.push(userId);
    }
    const sectionKotIdPlaceholder = userId !== null && !isNaN(userId) ? '$3' : '$2';
    updateSectionKotQuery += ` WHERE section_kot_id = ${sectionKotIdPlaceholder} RETURNING section_kot_id, status`;
    sectionKotParams.push(item.section_kot_id);

    const updateKotResult = await client.query(updateSectionKotQuery, sectionKotParams);
    console.log(`[KOT-DEBUG] Update section_kots returned ${updateKotResult.rowCount} rows:`, updateKotResult.rows);

    // Step 7: Fetch parent KOT info for cascading status updates
    const kotInfo = await client.query(
      `SELECT k.table_id, k.kot_id FROM kots k
       JOIN section_kots sk ON sk.parent_kot_id = k.kot_id
       WHERE sk.section_kot_id = $1`,
      [item.section_kot_id]
    );
    
    let tableId: string | null = null;
    let parentKotStatus: string | null = null;
    let orderStatus: string | null = null;
    if (kotInfo.rows.length > 0) {
      tableId = kotInfo.rows[0].table_id;
      const parentKotId = kotInfo.rows[0].kot_id;

      // Fetch all section KOTs for parent
      const siblingKotsResult = await client.query(
        `SELECT status FROM section_kots WHERE parent_kot_id = $1`,
        [parentKotId]
      );
      const siblingStatuses = siblingKotsResult.rows.map((r: any) => r.status);

      // Derive parent KOT status from its section KOTs.
      parentKotStatus = deriveParentKotStatusFromSections(siblingStatuses);
      console.log(`[KOT-DEBUG] Parent KOT ${parentKotId}: sibling statuses = [${siblingStatuses.join(', ')}], derived parent status = ${parentKotStatus}`);
      
      let updateParentKotQuery = `UPDATE kots SET status = $1, updated_at = CURRENT_TIMESTAMP`;
      const parentKotParams: any[] = [parentKotStatus];
      if (userId !== null && !isNaN(userId)) {
        updateParentKotQuery += `, updated_by = $2`;
        parentKotParams.push(userId);
      }
      const parentKotIdPlaceholder = userId !== null && !isNaN(userId) ? '$3' : '$2';
      updateParentKotQuery += ` WHERE kot_id = ${parentKotIdPlaceholder}`;
      parentKotParams.push(parentKotId);

      await client.query(updateParentKotQuery, parentKotParams);

      const orderResult = await client.query(
        `SELECT order_id FROM kots WHERE kot_id = $1`,
        [parentKotId]
      );

      if (orderResult.rows[0]) {
        const orderId = orderResult.rows[0].order_id;
        const allOrderKots = await client.query(
          `SELECT status FROM kots WHERE order_id = $1`,
          [orderId]
        );
        const orderKotStatuses = allOrderKots.rows.map((r: any) => r.status);
        orderStatus = deriveOrderStatusFromParentKots(orderKotStatuses);

        await client.query(
          `UPDATE orders
           SET status = $1,
               updated_at = CURRENT_TIMESTAMP,
               version = version + 1
           WHERE order_id = $2
             AND status <> $1`,
          [orderStatus, orderId]
        );
      }
    }

    await client.query('COMMIT');

    if (tableId) {
      broadcastToTable(tableId, {
        type: 'KOT_STATUS_UPDATED',
        tableId,
        itemId,
        status,
        derivedKotStatus,
        derivedOrderStatus: orderStatus
      });
    }

    res.json({ 
      ...updatedItem, 
      derivedSectionKotStatus: derivedKotStatus,
      derivedParentKotStatus: parentKotStatus,
      derivedOrderStatus: orderStatus,
      message: `Item status updated: ${currentStatus} → ${status}`
    });

    // Post-commit: if bill is paid, try to auto-free the table (validated)
    if ((status === 'served' || status === 'delivered' || status === 'cancelled') && tableId) {
      try {
        await tryAutoFreeTable(pool, tableId, `kot_item:${itemId}`);
      } catch (e: any) {
        console.warn('tryAutoFreeTable post-item-update error (non-fatal):', e.message);
      }
    }
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('POST /kots/items/:itemId/status error:', err.message);
    res.status(500).json({ message: err.message || 'Failed to update item status' });
  } finally {
    client.release();
  }
});

// DEPRECATED: POST /kots/section-kots/:sectionKotId/status
// ⚠️ This endpoint is DISABLED to enforce item-centric workflow.
// KOT status is now DERIVED from item statuses, never manually set.
// To update a KOT, update its individual items using POST /kots/items/:itemId/status
kotsRouter.post('/section-kots/:sectionKotId/status', async (req, res) => {
  res.status(410).json({
    error: 'ENDPOINT_DEPRECATED',
    message: 'KOT-wide status updates are no longer supported. This endpoint has been replaced with item-centric workflow.',
    instructions: [
      'Update individual KOT items instead: POST /kots/items/:itemId/status',
      'KOT status is automatically derived from all its items.',
      'Valid item statuses: pending, acknowledged, preparing, ready, served, cancelled, delivered, recook_requested',
      'Items must follow valid state transitions; invalid transitions will be rejected.'
    ]
  });
});

// LEGACY SECTION: Old KOT-wide endpoint code (preserved as reference, now disabled above)

// DEPRECATED: PATCH /kots/section-kots/:sectionKotId/items/:itemId/status
// ⚠️ This endpoint is superseded by POST /kots/items/:itemId/status which includes:
//   - Proper state machine validation
//   - Optimistic locking (version conflicts)
//   - Automatic timestamp tracking
//   - KOT status derivation
kotsRouter.patch('/section-kots/:sectionKotId/items/:itemId/status', async (req, res) => {
  res.status(410).json({
    error: 'ENDPOINT_MIGRATED',
    message: 'This endpoint has been moved to provide better state validation.',
    newEndpoint: 'POST /kots/items/:itemId/status',
    note: 'The new endpoint validates state transitions, tracks timestamps, and derives KOT status automatically.'
  });
});

// GET /kots/:kotId/sections - get all section KOTs for a parent KOT
// NOTE: This wildcard route must remain AFTER all specific-path routes above.
kotsRouter.get('/:kotId/sections', async (req, res) => {
  const { kotId } = req.params;
  try {
    const skotsResult = await pool.query(
      `SELECT sk.section_kot_id, sk.parent_kot_id, sk.section_id, sk.section_name,
              sk.section_kot_number, sk.status, sk.generated_at,
              sk.section_name AS kitchen_name,
              sk.section_kot_id AS kitchen_kot_id,
              sk.section_kot_number AS kitchen_kot_number
       FROM section_kots sk WHERE sk.parent_kot_id = $1`,
      [kotId]
    );

    const sectionKots = await Promise.all(
      skotsResult.rows.map(async (skot: { section_kot_id: string }) => {
        const itemsResult = await pool.query(
          `SELECT ski.section_kot_item_id, ski.item_id, ski.item_name, ski.quantity, ski.serial_number
           FROM section_kot_items ski WHERE ski.section_kot_id = $1`,
          [skot.section_kot_id]
        );
        return { ...skot, items: itemsResult.rows };
      })
    );

    res.json(sectionKots);
  } catch (err: any) {
    console.error('GET /kots/:kotId/sections error:', err);
    res.status(500).json({ message: 'Failed to fetch section KOTs' });
  }
});
