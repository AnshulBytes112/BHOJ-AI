import { Router } from 'express';
import { pool } from '../db';
import { tryAutoFreeTable, auditLog, ACTIVE_ITEM_STATUSES } from '../tables/table-management';

export const kotsRouter = Router();

// GET /kots — list all KOTs with is_bill_paid flag (for "Customer Already Paid" banner)
kotsRouter.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT k.kot_id, k.order_id, k.table_id, k.table_number, k.order_phase,
              k.kot_number, k.status, k.generated_at,
              t.is_bill_paid
       FROM kots k
       LEFT JOIN tables t ON t.table_id = k.table_id
       ORDER BY k.generated_at DESC`
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /kots error:', err);
    res.status(500).json({ message: 'Failed to fetch KOTs' });
  }
});

// ⚠️  IMPORTANT: These specific-path routes MUST come before /:kotId/sections
// to prevent Express from matching "sections" as a kotId parameter.

// GET /kots/sections/list - list all kitchen sections with their active KOTs count
kotsRouter.get('/sections/list', async (req, res) => {
  try {
    // First try: get categories and count pending KOTs per category
    try {
      const result = await pool.query(
        `SELECT c.name as section_id, c.name as section_name,
                COALESCE(COUNT(sk.section_kot_id) FILTER (WHERE sk.status = 'pending'), 0) as pending_count
         FROM categories c
         LEFT JOIN section_kots sk ON sk.section_name = c.name
         WHERE c.is_active = true
         GROUP BY c.name ORDER BY c.name`
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
                COUNT(*) FILTER (WHERE status = 'pending') as pending_count
         FROM section_kots
         GROUP BY section_name ORDER BY section_name`
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
    const skotsResult = await pool.query(
      `SELECT sk.section_kot_id, sk.parent_kot_id, sk.section_id, sk.section_name,
              sk.section_kot_number, sk.status, sk.generated_at,
              k.table_number, k.kot_number, k.order_phase, k.order_id,
              t.is_bill_paid
       FROM section_kots sk
       LEFT JOIN kots k    ON k.kot_id    = sk.parent_kot_id
       LEFT JOIN tables t  ON t.table_id  = k.table_id
       WHERE sk.section_name = $1
         AND sk.status NOT IN ('served', 'completed')
       ORDER BY sk.generated_at DESC`,
      [sectionId]
    );

    const sectionKots = await Promise.all(
      skotsResult.rows.map(async (skot) => {
        const itemsResult = await pool.query(
          `SELECT ski.section_kot_item_id, ski.item_id, ski.item_name,
                  ski.quantity, ski.serial_number, ski.status
           FROM section_kot_items ski WHERE ski.section_kot_id = $1`,
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

// POST /kots/section-kots/:sectionKotId/status — update section KOT status
kotsRouter.post('/section-kots/:sectionKotId/status', async (req, res) => {
  const { sectionKotId } = req.params;
  const { status } = req.body;

  const validStatuses = ['pending', 'acknowledged', 'ready', 'completed', 'served'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ message: `status must be one of: ${validStatuses.join(', ')}` });
  }

  const client = await pool.connect();
  let currentStep = 'begin';
  try {
    await client.query('BEGIN');

    currentStep = 'update_section_kot';
    const skotResult = await client.query(
      `UPDATE section_kots SET status = $1::kot_status WHERE section_kot_id = $2 RETURNING *`,
      [status, sectionKotId]
    );
    if (skotResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Section KOT not found' });
    }

    const skot = skotResult.rows[0];
    console.log(`Section KOT ${sectionKotId} status updated to ${status}`);

    // When a section KOT is served/completed, propagate status to all its items
    if (status === 'served' || status === 'completed') {
      const itemStatus = status === 'served' ? 'served' : 'ready';
      await client.query(
        `UPDATE section_kot_items
         SET status = $1
         WHERE section_kot_id = $2
           AND status = ANY($3::text[])`,
        [itemStatus, sectionKotId, ACTIVE_ITEM_STATUSES]
      );
    }

    let orderIdToComplete: string | null = null;

    currentStep = 'fetch_siblings';
    const siblings = await client.query(
      `SELECT status FROM section_kots WHERE parent_kot_id = $1`,
      [skot.parent_kot_id]
    );
    const siblingStatuses = siblings.rows.map((r: any) => r.status);
    console.log(`Parent KOT ${skot.parent_kot_id} siblings statuses:`, siblingStatuses);

    let parentStatus: string | null = null;
    if (siblingStatuses.every((s: string) => s === 'served')) {
      parentStatus = 'completed';
    } else if (siblingStatuses.every((s: string) => s === 'completed' || s === 'served')) {
      parentStatus = 'ready';
    } else if (siblingStatuses.every((s: string) => s === 'acknowledged' || s === 'completed' || s === 'served')) {
      parentStatus = 'acknowledged';
    }

    if (parentStatus) {
      currentStep = 'update_parent_kot';
      await client.query(
        `UPDATE kots SET status = $1::kot_status WHERE kot_id = $2`,
        [parentStatus, skot.parent_kot_id]
      );
      console.log(`Parent KOT ${skot.parent_kot_id} status updated to ${parentStatus}`);

      if (parentStatus === 'completed') {
        currentStep = 'fetch_kot_order_id';
        const kotRow = await client.query(
          `SELECT order_id FROM kots WHERE kot_id = $1`,
          [skot.parent_kot_id]
        );
        if (kotRow.rows.length > 0) {
          const orderId = kotRow.rows[0].order_id;
          currentStep = 'fetch_order_kots';
          const allKotsForOrder = await client.query(
            `SELECT status FROM kots WHERE order_id = $1`,
            [orderId]
          );
          if (allKotsForOrder.rows.every((r: any) => r.status === 'completed')) {
            orderIdToComplete = orderId;
          }
        }
      }
    }

    // Audit the section KOT status change
    await auditLog(client, 'KOT_STATUS_CHANGED', {
      entityType: 'section_kot',
      entityId: sectionKotId,
      tableId: skot.table_id ?? undefined,
      reason: `Section KOT marked ${status}`,
      metadata: { sectionKotId, newStatus: status, parentKotId: skot.parent_kot_id },
    });

    currentStep = 'commit';
    await client.query('COMMIT');
    res.json({ ...skot, parentStatus });

    // Post-commit: update order status
    if (orderIdToComplete) {
      try {
        await pool.query(
          `UPDATE orders SET status = 'completed'::order_status_enum WHERE order_id = $1`,
          [orderIdToComplete]
        );
        console.log(`Order ${orderIdToComplete} marked completed`);
      } catch (enumCastErr: any) {
        console.error('order_status_enum cast failed:', enumCastErr.message);
        try {
          await pool.query(
            `UPDATE orders SET status = 'sent_to_kitchen' WHERE order_id = $1`,
            [orderIdToComplete]
          );
        } catch (fbErr: any) {
          console.error('Order status fallback also failed:', fbErr.message);
        }
      }
    }

    // Post-commit: attempt auto-free (only when serving/completing items)
    if ((status === 'served' || status === 'completed') && skot.table_id) {
      try {
        await tryAutoFreeTable(pool, skot.table_id, `section_kot:${sectionKotId}`);
      } catch (e: any) {
        console.warn('tryAutoFreeTable post-section-kot-update error (non-fatal):', e.message);
      }
    }
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('POST /kots/section-kots/:sectionKotId/status error:', err.message, err.stack);
    res.status(500).json({ message: err.message || 'Failed to update section KOT status', step: currentStep });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /kots/section-kots/:sectionKotId/items/:itemId/status
// Update the status of a SINGLE KOT item independently (granular item tracking).
// Triggers auto-free check after each item status change.
// ─────────────────────────────────────────────────────────────────────────────
kotsRouter.patch('/section-kots/:sectionKotId/items/:itemId/status', async (req, res) => {
  const { sectionKotId, itemId } = req.params;
  const { status, user_id } = req.body;

  const validItemStatuses = [
    'pending', 'preparing', 'ready', 'served', 'cancelled',
    'packed', 'delivered', 'recook_requested',
  ];
  if (!status || !validItemStatuses.includes(status)) {
    return res.status(400).json({
      message: `status must be one of: ${validItemStatuses.join(', ')}`,
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch item + its parent chain to get table_id
    const itemResult = await client.query(
      `SELECT ski.section_kot_item_id, ski.status AS old_status, ski.item_name,
              sk.section_kot_id, sk.parent_kot_id,
              k.table_id
       FROM section_kot_items ski
       JOIN section_kots sk ON sk.section_kot_id = ski.section_kot_id
       JOIN kots k          ON k.kot_id          = sk.parent_kot_id
       WHERE ski.section_kot_item_id = $1
         AND ski.section_kot_id = $2
       FOR UPDATE`,
      [itemId, sectionKotId]
    );

    if (itemResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'KOT item not found' });
    }

    const item = itemResult.rows[0];
    const tableId: string = item.table_id;

    // Update item status
    await client.query(
      `UPDATE section_kot_items SET status = $1 WHERE section_kot_item_id = $2`,
      [status, itemId]
    );

    // Audit item status change
    await auditLog(client, 'KOT_ITEM_STATUS_CHANGED', {
      entityType: 'section_kot_item',
      entityId: itemId,
      tableId,
      userId: user_id ?? null,
      reason: `Item '${item.item_name}' marked ${status}`,
      metadata: {
        itemId,
        sectionKotId,
        itemName: item.item_name,
        oldStatus: item.old_status,
        newStatus: status,
      },
    });

    await client.query('COMMIT');

    // Post-commit: try auto-free whenever an item reaches a terminal state
    const terminalStatuses = ['served', 'delivered', 'cancelled'];
    if (terminalStatuses.includes(status)) {
      try {
        await tryAutoFreeTable(pool, tableId, `item:${itemId}`);
      } catch (e: any) {
        console.warn('tryAutoFreeTable post-item-update error (non-fatal):', e.message);
      }
    }

    res.json({
      message: `Item status updated to ${status}.`,
      itemId,
      newStatus: status,
      tableId,
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('PATCH /kots/section-kots/:sectionKotId/items/:itemId/status error:', err);
    res.status(500).json({ message: err.message || 'Failed to update item status' });
  } finally {
    client.release();
  }
});

// GET /kots/:kotId/sections - get all section KOTs for a parent KOT
// NOTE: This wildcard route must remain AFTER all specific-path routes above.
kotsRouter.get('/:kotId/sections', async (req, res) => {
  const { kotId } = req.params;
  try {
    const skotsResult = await pool.query(
      `SELECT sk.section_kot_id, sk.parent_kot_id, sk.section_id, sk.section_name,
              sk.section_kot_number, sk.status, sk.generated_at
       FROM section_kots sk WHERE sk.parent_kot_id = $1`,
      [kotId]
    );

    const sectionKots = await Promise.all(
      skotsResult.rows.map(async (skot) => {
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
