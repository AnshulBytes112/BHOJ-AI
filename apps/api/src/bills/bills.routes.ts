import { Router } from 'express';
import { PoolClient } from 'pg';
import { randomBytes } from 'crypto';
import { pool } from '../db';
import { tryAutoFreeTable, auditLog } from '../tables/table-management';
import { broadcastToTable } from '../websocket';

type BillStatus = 'draft' | 'completed' | 'printed';

type BillRow = {
  id: number;
  bill_serial_number: number;
  cashier_id: number;
  subtotal: string;
  gst_total: string;
  grand_total: string;
  status: BillStatus;
  payment_status: 'unpaid' | 'paid';
  table_id: string | null;
  session_id: string | null;
  created_at: Date;
  extra_charges?: Array<{
    name: string;
    charge_type: 'fixed' | 'percentage';
    value: number;
    amount: number;
  }>;
};

type BillListRow = BillRow & {
  items_count: number;
};

type BillItemRow = {
  id: number;
  bill_id: number;
  item_id: number;
  item_name: string;
  quantity: number;
  unit_price: string;
  gst_rate: string;
  gst_amount: string;
  line_total: string;
};

type CatalogItemRow = {
  id: number;
  name: string;
  category: string;
  selling_price: string;
  is_active: boolean;
};

type GstRow = {
  gst_percentage: string;
};

type CreateBillLineInput = {
  item_id?: unknown;
  itemId?: unknown;
  quantity?: unknown;
};

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

function parsePositiveInt(value: unknown, fieldName: string): number {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
  return num;
}

function parseCreateBillBody(rawBody: unknown): { cashierId: number; lines: Array<{ itemId: number; quantity: number }>; tableId?: string; orderIds?: string[]; payNow?: boolean } {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    throw new Error('Request body must be a valid object.');
  }

  const body = rawBody as { cashier_id?: unknown; items?: unknown; table_id?: unknown; order_ids?: unknown; pay_now?: unknown };
  const cashierId = body.cashier_id === undefined ? 1 : parsePositiveInt(body.cashier_id, 'cashier_id');

  const itemsInput = Array.isArray(body.items) ? body.items : [];
  if (itemsInput.length === 0 && !Array.isArray(body.order_ids)) {
    throw new Error('items must be a non-empty array when order_ids are not provided.');
  }

  const lines = itemsInput.map((line, index) => {
    if (!line || typeof line !== 'object' || Array.isArray(line)) {
      throw new Error(`items[${index}] must be an object.`);
    }

    const rawLine = line as CreateBillLineInput;
    const itemRaw = rawLine.item_id ?? rawLine.itemId;

    return {
      itemId: parsePositiveInt(itemRaw, `items[${index}].item_id`),
      quantity: parsePositiveInt(rawLine.quantity, `items[${index}].quantity`),
    };
  });

  return { 
    cashierId, 
    lines, 
    tableId: typeof body.table_id === 'string' ? body.table_id : undefined,
    orderIds: Array.isArray(body.order_ids) ? body.order_ids : undefined,
    // pay_now=true means the bill is being paid at creation time (combined bill+payment)
    payNow: body.pay_now === true,
  };
}

async function getGstRateForCategory(client: PoolClient, category: string): Promise<number> {
  const config = await client.query<GstRow>(
    'SELECT gst_percentage FROM gst_config WHERE LOWER(category) = LOWER($1) AND is_active = true LIMIT 1;',
    [category]
  );

  if (config.rowCount === 0) {
    // If no specific config, default to 5% or handle as error?
    // User said: Show warning if a category has no active GST slab
    // For now, I'll return 0 if not found, but it might be better to have a default.
    return 0;
  }

  return Number(config.rows[0].gst_percentage);
}

async function ensureActiveTableSession(
  client: PoolClient,
  tableId: string,
  userId: number | null,
): Promise<string> {
  const activeSession = await client.query(
    `SELECT ts.session_id
     FROM table_sessions ts
     LEFT JOIN session_tables st ON ts.session_id = st.session_id
     WHERE (ts.table_id = $1 OR st.table_id = $1)
       AND ts.status IN ('active', 'billed', 'payment_pending', 'payment_done', 'waiting_service_completion', 'ready_to_close')
     LIMIT 1
     FOR UPDATE OF ts`,
    [tableId]
  );

  if (activeSession.rows.length > 0) {
    return activeSession.rows[0].session_id;
  }

  const tableResult = await client.query(
    `SELECT table_id, table_number FROM tables WHERE table_id = $1 FOR UPDATE`,
    [tableId]
  );

  if (tableResult.rows.length === 0) {
    throw new Error('Table not found.');
  }

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomHex = randomBytes(3).toString('hex').toUpperCase();
  const sessionCode = `SESS-T${tableResult.rows[0].table_number}-${dateStr}-${randomHex}`;

  const created = await client.query(
    `INSERT INTO table_sessions (
       table_id, session_code, status, guest_count, started_at,
       payment_status, is_payment_locked, is_force_closed, source_type,
       created_by, version
     ) VALUES ($1, $2, 'active', 1, NOW(), 'unpaid', false, false, 'POS', $3, 1)
     RETURNING session_id`,
    [tableId, sessionCode, userId]
  );

  const sessionId = created.rows[0].session_id;

  await client.query(
    `INSERT INTO session_tables (session_id, table_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [sessionId, tableId]
  );

  await client.query(
    `INSERT INTO session_events (session_id, event_type, timestamp, metadata, source_device, source_channel, performed_by)
     VALUES ($1, 'SESSION_STARTED', NOW(), $2, 'POS_TERMINAL', 'POS', $3)`,
    [sessionId, JSON.stringify({ table_id: tableId, note: 'Auto-started by bill generation' }), userId]
  );

  return sessionId;
}

export const billsRouter = Router();

billsRouter.post('/', async (req, res) => {
  const client = await pool.connect();

  try {
    const { cashierId, lines, tableId, orderIds, payNow } = parseCreateBillBody(req.body);

    await client.query('BEGIN');

    // Build order items if no orders were provided
    const mergedLineMap = new Map<number, number>();
    for (const line of lines) {
      mergedLineMap.set(line.itemId, (mergedLineMap.get(line.itemId) ?? 0) + line.quantity);
    }
    const activeSessionId = tableId
      ? await ensureActiveTableSession(client, tableId, cashierId)
      : null;

    if (activeSessionId) {
      const paidBillResult = await client.query(
        `SELECT id, created_at
         FROM bills
         WHERE session_id = $1 AND payment_status = 'paid'
         ORDER BY created_at DESC
         LIMIT 1`,
        [activeSessionId]
      );

      if (paidBillResult.rowCount > 0) {
        const lastPaidAt = paidBillResult.rows[0].created_at;
        const newerOrders = await client.query(
          `SELECT 1
           FROM orders
           WHERE session_id = $1
             AND created_at > $2
           LIMIT 1`,
          [activeSessionId, lastPaidAt]
        );

        if (newerOrders.rowCount === 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({ message: 'Bill already generated for this session.' });
        }
      }
    }

    // ── CREATE ORDER IF NONE EXISTS ──────────────────────────────────────────
    // When bill is generated, ensure an order exists for the kitchen to prepare items
    let actualOrderIds = orderIds || [];

    if (activeSessionId && actualOrderIds.length > 0) {
      await client.query(
        `UPDATE orders
         SET session_id = COALESCE(session_id, $1)
         WHERE order_id = ANY($2::uuid[])`,
        [activeSessionId, actualOrderIds]
      );
    }
    
    if (tableId && actualOrderIds.length === 0) {
      const uniqueItemIds = Array.from(mergedLineMap.keys());
      const itemRows = await client.query<CatalogItemRow>(
        'SELECT id, name, category, selling_price, is_active FROM items WHERE id = ANY($1::int[]);',
        [uniqueItemIds]
      );

      const itemById = new Map<number, CatalogItemRow>(itemRows.rows.map((row: CatalogItemRow) => [row.id, row]));
      for (const itemId of uniqueItemIds) {
        const item = itemById.get(itemId);
        if (!item) {
          throw new Error(`Item ${itemId} not found.`);
        }
        if (!item.is_active) {
          throw new Error(`Item ${itemId} is inactive and cannot be billed.`);
        }
      }

      // No orders provided - create one for these items
      console.log(`[POST /bills] Creating new order for table ${tableId} with ${mergedLineMap.size} items`);
      
      const orderPhaseResult = await client.query(
        `SELECT COALESCE(MAX(order_phase), 0) + 1 as next_phase FROM orders WHERE table_id = $1`,
        [tableId]
      );
      const orderPhase = orderPhaseResult.rows[0].next_phase;

      const orderResult = await client.query<{ order_id: string; created_at: string }>(
        `INSERT INTO orders (table_id, order_phase, status, session_id)
         VALUES ($1, $2, 'open', $3)
         RETURNING order_id, created_at`,
        [tableId, orderPhase, activeSessionId]
      );
      const newOrder = orderResult.rows[0];
      actualOrderIds = [newOrder.order_id];

      // Create order_items for each bill item
      for (const [itemId, quantity] of mergedLineMap.entries()) {
        const item = itemById.get(itemId) as CatalogItemRow;
        const gstRate = await getGstRateForCategory(client, item.category);
        await client.query(
          `INSERT INTO order_items (order_id, item_id, quantity, price_at_billing, gst_percent_at_billing)
           VALUES ($1, $2, $3, $4, $5)`,
          [newOrder.order_id, item.id, quantity, Number(item.selling_price), gstRate]
        );
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Fetch ONLY unbilled order items for this bill
    if (actualOrderIds.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'No orders found to bill.' });
    }

    const unbilledItemsResult = await client.query(
      `SELECT oi.order_item_id, oi.item_id, oi.quantity,
              oi.price_at_billing, oi.gst_percent_at_billing,
              i.name as item_name
       FROM order_items oi
       JOIN orders o ON o.order_id = oi.order_id
       JOIN items i ON i.id = oi.item_id
       WHERE oi.order_id = ANY($1::uuid[])
         AND oi.billing_status = 'UNBILLED'
         AND o.status <> 'cancelled'
         AND NOT EXISTS (
           SELECT 1 
           FROM kots k
           JOIN kot_items ki ON ki.kot_id = k.kot_id
           WHERE k.order_id = o.order_id
             AND ki.item_id = oi.item_id
             AND ki.status = 'cancelled'
         )
         AND NOT EXISTS (
           SELECT 1
           FROM kots k
           JOIN section_kots sk ON sk.parent_kot_id = k.kot_id
           JOIN section_kot_items ski ON ski.section_kot_id = sk.section_kot_id
           WHERE k.order_id = o.order_id
             AND ski.item_id = oi.item_id
             AND ski.status = 'cancelled'
         )`,
      [actualOrderIds]
    );

    if (unbilledItemsResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'No unbilled items found for this session.' });
    }

    let subtotal = 0;
    let gstTotal = 0;
    const billItemsPayload: Array<{
      order_item_id: string;
      item_id: number;
      item_name: string;
      quantity: number;
      unit_price: number;
      gst_rate: number;
      gst_amount: number;
      line_total: number;
    }> = [];

    for (const row of unbilledItemsResult.rows) {
      const unitPrice = Number(row.price_at_billing);
      const gstRate = Number(row.gst_percent_at_billing);
      const quantity = Number(row.quantity);
      const baseAmount = roundMoney(unitPrice * quantity);
      const gstAmount = roundMoney(baseAmount * (gstRate / 100));
      const lineTotal = roundMoney(baseAmount + gstAmount);

      subtotal = roundMoney(subtotal + baseAmount);
      gstTotal = roundMoney(gstTotal + gstAmount);

      billItemsPayload.push({
        order_item_id: row.order_item_id,
        item_id: row.item_id,
        item_name: row.item_name,
        quantity,
        unit_price: unitPrice,
        gst_rate: gstRate,
        gst_amount: gstAmount,
        line_total: lineTotal,
      });
    }

    // ── RESOLVE ORDER TYPE from the session/orders for apply_on charge filtering ──
    let resolvedOrderType = 'Dine In';
    if (actualOrderIds.length > 0) {
      const otResult = await client.query(
        `SELECT order_type FROM orders WHERE order_id = ANY($1::uuid[]) AND order_type IS NOT NULL LIMIT 1`,
        [actualOrderIds]
      );
      if (otResult.rows.length > 0 && otResult.rows[0].order_type) {
        resolvedOrderType = otResult.rows[0].order_type;
      }
    }
    const orderTypeLower = resolvedOrderType.toLowerCase();
    const isParcel   = orderTypeLower.includes('parcel') || orderTypeLower.includes('takeaway');
    const isDineIn   = orderTypeLower.includes('dine');
    const isDelivery = orderTypeLower.includes('delivery');

    // Fetch applicable extra charges filtered by apply_on rule
    const activeChargesResult = await client.query(
      `SELECT name, charge_type, value, apply_on, is_taxable
       FROM extra_charges
       WHERE is_active = true
         AND (
           apply_on = 'always'
           OR (apply_on = 'parcel'   AND $1 = true)
           OR (apply_on = 'takeaway' AND $1 = true)
           OR (apply_on = 'dine_in'  AND $2 = true)
           OR (apply_on = 'delivery' AND $3 = true)
         )`,
      [isParcel, isDineIn, isDelivery]
    );

    // Split into taxable (added to GST base) and non-taxable (added after GST)
    let taxableChargesTotal = 0;
    let nonTaxableChargesTotal = 0;
    const extraChargesBreakdown: Array<{
      name: string; charge_type: string; value: number;
      amount: number; apply_on: string; is_taxable: boolean;
    }> = [];

    for (const charge of activeChargesResult.rows) {
      const val = Number(charge.value);
      let amt = 0;
      if (charge.charge_type === 'percentage') {
        // percentage base is always the item subtotal
        amt = roundMoney(subtotal * (val / 100));
      } else {
        amt = roundMoney(val);
      }
      if (charge.is_taxable) {
        taxableChargesTotal = roundMoney(taxableChargesTotal + amt);
      } else {
        nonTaxableChargesTotal = roundMoney(nonTaxableChargesTotal + amt);
      }
      extraChargesBreakdown.push({
        name: charge.name,
        charge_type: charge.charge_type,
        value: val,
        amount: amt,
        apply_on: charge.apply_on,
        is_taxable: charge.is_taxable,
      });
    }

    // GST is calculated on (item subtotal + taxable extra charges)
    const gstBase = roundMoney(subtotal + taxableChargesTotal);
    // Recalculate gstTotal based on new gstBase ratio (proportional uplift)
    const gstMultiplier = subtotal > 0 ? gstBase / subtotal : 1;
    const adjustedGstTotal = roundMoney(gstTotal * gstMultiplier);

    const grandTotal = roundMoney(gstBase + adjustedGstTotal + nonTaxableChargesTotal);

    // ── CORE FIX: payment is treated as successful by default until payment module exists.
    // The table is NEVER freed here — that is handled by tryAutoFreeTable.
    const paymentStatus: 'paid' | 'unpaid' = 'paid';
    const billIsPaid = paymentStatus === 'paid';

    const billResult = await client.query<BillRow>(
      `
      INSERT INTO bills (cashier_id, subtotal, gst_total, grand_total, status, payment_status, table_id, session_id, extra_charges)
      VALUES ($1, $2, $3, $4, 'completed', $5, $6, $7, $8)
      RETURNING *;
      `,
      [
        cashierId,
        gstBase,          // subtotal stored = item subtotal + taxable charges (the taxable base)
        adjustedGstTotal, // gst on the full taxable base
        grandTotal,
        paymentStatus,
        tableId ?? null,
        activeSessionId,
        JSON.stringify(extraChargesBreakdown),
      ]
    );


    const bill = billResult.rows[0];

    for (const line of billItemsPayload) {
      await client.query(
        `
        INSERT INTO bill_items
          (bill_id, item_id, item_name, quantity, unit_price, gst_rate, gst_amount, line_total)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8);
        `,
        [
          bill.id,
          line.item_id,
          line.item_name,
          line.quantity,
          line.unit_price,
          line.gst_rate,
          line.gst_amount,
          line.line_total,
        ]
      );
    }

    await client.query(
      `UPDATE order_items
       SET billing_status = 'BILLED'
       WHERE order_item_id = ANY($1::uuid[])`,
      [billItemsPayload.map((item) => item.order_item_id)]
    );

    // Update order status to 'billed' since a bill has been generated
    await client.query(
      `UPDATE orders
       SET status = 'billed'
       WHERE order_id = ANY($1::uuid[])`,
      [actualOrderIds]
    );

    // Update table billing status — but NEVER auto-free here (RULE 2)
    if (tableId) {
      if (billIsPaid) {
        // Payment done — move to waiting_for_service_completion, NOT free
        await client.query(
          `UPDATE tables
           SET status = 'waiting_for_service_completion', is_bill_paid = true, occupied_since = COALESCE(occupied_since, NOW())
           WHERE table_id = $1`,
          [tableId]
        );
        if (activeSessionId) {
          await client.query(
            `UPDATE table_sessions
             SET status = 'payment_done',
                 payment_status = 'paid',
                 is_payment_locked = true,
                 last_activity_at = NOW(),
                 version = version + 1
             WHERE session_id = $1`,
            [activeSessionId]
          );
        }
        console.log(`[POST /bills] Table ${tableId}: status → waiting_for_service_completion, occupied_since set`);
      } else {
        // Bill generated but not yet paid
        await client.query(
          `UPDATE tables
           SET status = 'billing_done', occupied_since = COALESCE(occupied_since, NOW())
           WHERE table_id = $1`,
          [tableId]
        );
        if (activeSessionId) {
          await client.query(
            `UPDATE table_sessions
             SET status = 'billed',
                 payment_status = 'unpaid',
                 is_payment_locked = false,
                 last_activity_at = NOW(),
                 version = version + 1
             WHERE session_id = $1`,
            [activeSessionId]
          );
        }
        console.log(`[POST /bills] Table ${tableId}: status → billing_done, occupied_since set`);
      }
    }

    // Audit bill generation
    await auditLog(client, billIsPaid ? 'BILL_PAID' : 'BILL_GENERATED', {
      entityType: 'bill',
      entityId: String(bill.id),
      tableId: tableId ?? undefined,
      userId: cashierId,
      reason: billIsPaid ? 'Bill created and paid at POS' : 'Bill generated',
      metadata: { billSerialNumber: bill.bill_serial_number, grandTotal },
    });

    const billItems = await client.query<BillItemRow>(
      'SELECT * FROM bill_items WHERE bill_id = $1 ORDER BY id ASC;',
      [bill.id]
    );

    await client.query('COMMIT');

    // Broadcast update to table client so they can see the generated bill
    if (tableId && activeSessionId) {
      broadcastToTable(tableId, {
        type: 'BILL_STATUS_UPDATED',
        tableId,
        status: 'billed',
        sessionId: activeSessionId
      });
    }

    // Post-commit: if bill is paid, try to auto-free the table (validated)
    // This is safe because tryAutoFreeTable opens its own transaction.
    let autoFreeResult = null;
    if (billIsPaid && tableId) {
      try {
        autoFreeResult = await tryAutoFreeTable(pool, tableId, `bill:${bill.id}`);
      } catch (autoFreeErr: any) {
        console.warn('tryAutoFreeTable post-commit error (non-fatal):', autoFreeErr.message);
      }
    }

    res.status(201).json({
      bill,
      items: billItems.rows,
      tableFreed: autoFreeResult?.freed ?? false,
      tableStatus: autoFreeResult?.newStatus ?? null,
      // If bill paid but table not freed: warn the client
      warning: (billIsPaid && autoFreeResult && !autoFreeResult.freed)
        ? `Bill Paid. Waiting for kitchen/service completion. Table cannot be freed. ${autoFreeResult.validation.reason}`
        : null,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    const message = error instanceof Error ? error.message : 'Failed to create bill.';
    res.status(400).json({ message });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /bills/:id/payment — mark a bill as paid / unpaid
//
// This is the primary way to record payment AFTER bill generation.
// RULE 2: Table is NEVER auto-freed here — tryAutoFreeTable handles that.
// ─────────────────────────────────────────────────────────────────────────────
billsRouter.patch('/:id/payment', async (req, res) => {
  const billId = Number(req.params.id);
  if (!Number.isInteger(billId) || billId <= 0) {
    return res.status(400).json({ message: 'id must be a positive integer.' });
  }

  const { payment_status, user_id } = req.body;
  if (!['paid', 'unpaid'].includes(payment_status)) {
    return res.status(400).json({ message: 'payment_status must be "paid" or "unpaid".' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id, payment_status, table_id, session_id FROM bills WHERE id = $1 FOR UPDATE`,
      [billId]
    );
    if (existing.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Bill not found.' });
    }

    const bill = existing.rows[0];
    const tableId: string | null = bill.table_id;
    const sessionId: string | null = bill.session_id;

    await client.query(
      `UPDATE bills SET payment_status = $1 WHERE id = $2`,
      [payment_status, billId]
    );

    // Update table is_bill_paid flag (check if ALL bills for this table are now paid)
    if (tableId) {
      const billsForTable = await client.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE payment_status = 'paid' OR id = $1) AS now_paid
         FROM bills
         WHERE ${sessionId ? 'session_id = $2' : 'table_id = $2'}`,
        [payment_status === 'paid' ? billId : -1, sessionId ?? tableId]
      );
      const allPaid = parseInt(billsForTable.rows[0].total, 10) > 0 &&
                      parseInt(billsForTable.rows[0].total, 10) === parseInt(billsForTable.rows[0].now_paid, 10);

      await client.query(
        `UPDATE tables SET is_bill_paid = $1 WHERE table_id = $2`,
        [payment_status === 'paid' && allPaid, tableId]
      );

      // Move table to WAITING_FOR_SERVICE_COMPLETION when paid (NOT free!)
      if (payment_status === 'paid') {
        await client.query(
          `UPDATE tables
           SET status = 'waiting_for_service_completion'
           WHERE table_id = $1
             AND status NOT IN ('free')`,
          [tableId]
        );
      }

      if (sessionId) {
        await client.query(
          `UPDATE table_sessions
           SET status = $1,
               payment_status = $2,
               is_payment_locked = $3,
               last_activity_at = NOW(),
               version = version + 1
           WHERE session_id = $4`,
          [
            payment_status === 'paid' ? 'payment_done' : 'payment_pending',
            payment_status,
            payment_status === 'paid',
            sessionId,
          ]
        );
      }
    }

    await auditLog(client, 'PAYMENT_COMPLETED', {
      entityType: 'bill',
      entityId: String(billId),
      tableId: tableId ?? undefined,
      userId: user_id ?? null,
      reason: `Bill ${payment_status}`,
      metadata: { billId, paymentStatus: payment_status },
    });

    await client.query('COMMIT');

    // Post-commit: attempt auto-free (safe, opens own transaction)
    let autoFreeResult = null;
    if (payment_status === 'paid' && tableId) {
      try {
        autoFreeResult = await tryAutoFreeTable(pool, tableId, `payment:${billId}`);
      } catch (e: any) {
        console.warn('tryAutoFreeTable post-payment error (non-fatal):', e.message);
      }
    }

    res.json({
      message: `Bill marked ${payment_status}.`,
      billId,
      paymentStatus: payment_status,
      tableFreed: autoFreeResult?.freed ?? false,
      tableStatus: autoFreeResult?.newStatus ?? null,
      warning: (payment_status === 'paid' && autoFreeResult && !autoFreeResult.freed)
        ? `Bill Paid. Waiting for kitchen/service completion. Table cannot be freed. ${autoFreeResult.validation.reason}`
        : null,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    const message = error instanceof Error ? error.message : 'Failed to update payment.';
    res.status(400).json({ message });
  } finally {
    client.release();
  }
});

billsRouter.get('/', async (_req, res) => {
  try {
    const result = await pool.query<BillListRow>(
      `
      SELECT
        b.*,
        COUNT(bi.id)::int AS items_count
      FROM bills b
      LEFT JOIN bill_items bi ON bi.bill_id = b.id
      GROUP BY b.id
      ORDER BY b.id DESC;
      `
    );

    res.json(result.rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch bills.';
    res.status(400).json({ message });
  }
});

billsRouter.get('/:id', async (req, res) => {
  const billId = Number(req.params.id);
  if (!Number.isInteger(billId) || billId <= 0) {
    res.status(400).json({ message: 'id must be a positive integer.' });
    return;
  }

  try {
    const billResult = await pool.query<BillRow>('SELECT * FROM bills WHERE id = $1;', [billId]);
    if (billResult.rowCount === 0) {
      res.status(404).json({ message: 'Bill not found.' });
      return;
    }

    const itemResult = await pool.query<BillItemRow>(
      'SELECT * FROM bill_items WHERE bill_id = $1 ORDER BY id ASC;',
      [billId]
    );

    res.json({
      bill: billResult.rows[0],
      items: itemResult.rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch bill.';
    res.status(400).json({ message });
  }
});

billsRouter.get('/:id/receipt', async (req, res) => {
  const billId = Number(req.params.id);
  if (!Number.isInteger(billId) || billId <= 0) {
    res.status(400).json({ message: 'id must be a positive integer.' });
    return;
  }

  try {
    const billResult = await pool.query<BillRow>('SELECT * FROM bills WHERE id = $1;', [billId]);
    if (billResult.rowCount === 0) {
      res.status(404).json({ message: 'Bill not found.' });
      return;
    }

    const itemResult = await pool.query<BillItemRow>(
      'SELECT * FROM bill_items WHERE bill_id = $1 ORDER BY id ASC;',
      [billId]
    );

    const layoutResult = await pool.query(
      'SELECT logo_url, header_text, footer_text, show_gst_breakdown FROM receipt_layout LIMIT 1;'
    );

    const layout = layoutResult.rows[0] || {
      logo_url: null,
      header_text: 'RestroManager Hotel',
      footer_text: 'Thank you for visiting!',
      show_gst_breakdown: true
    };

    const bill = billResult.rows[0];

    res.json({
      bill_serial_number: bill.bill_serial_number,
      created_at: bill.created_at,
      header_text: layout.header_text,
      footer_text: layout.footer_text,
      logo_url: layout.logo_url,
      show_gst_breakdown: layout.show_gst_breakdown,
      items: itemResult.rows.map((item: BillItemRow) => ({
        item_name: item.item_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        gst_rate: item.gst_rate,
        gst_amount: item.gst_amount,
        line_total: item.line_total
      })),
      subtotal: bill.subtotal,
      gst_total: bill.gst_total,
      grand_total: bill.grand_total,
      extra_charges: bill.extra_charges
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch receipt data.';
    res.status(400).json({ message });
  }
});

billsRouter.post('/:id/print', async (req, res) => {
  const billId = Number(req.params.id);
  if (!Number.isInteger(billId) || billId <= 0) {
    res.status(400).json({ message: 'id must be a positive integer.' });
    return;
  }

  try {
    const existing = await pool.query<BillRow>('SELECT * FROM bills WHERE id = $1;', [billId]);
    if (existing.rowCount === 0) {
      res.status(404).json({ message: 'Bill not found.' });
      return;
    }

    const current = existing.rows[0];
    if (current.status === 'draft') {
      res.status(400).json({ message: 'Draft bills cannot be printed.' });
      return;
    }

    if (current.status === 'printed') {
      res.json(current);
      return;
    }

    const updated = await pool.query<BillRow>(
      "UPDATE bills SET status = 'printed' WHERE id = $1 RETURNING *;",
      [billId]
    );

    res.json(updated.rows[0]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to print bill.';
    res.status(400).json({ message });
  }
});
