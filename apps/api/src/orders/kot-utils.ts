import { PoolClient } from 'pg';

export function kitchenCode(sectionName: string): string {
  const compact = sectionName
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map(part => part[0])
    .join('')
    .toUpperCase();

  return (compact || 'GEN').slice(0, 6);
}

export async function generateKotForOrder(client: PoolClient, orderId: string) {
  // 1. Get order details
  const orderResult = await client.query(
    `SELECT o.*, t.table_number FROM orders o
     LEFT JOIN tables t ON t.table_id = o.table_id
     WHERE o.order_id = $1`,
    [orderId]
  );
  if (orderResult.rows.length === 0) throw new Error('Order not found');
  const order = orderResult.rows[0];

  // 2. Get items for this order
  const itemsResult = await client.query(
    `SELECT oi.order_item_id, oi.item_id, i.name as item_name, oi.quantity, i.serial_number,
            i.category as section_name, oi.extras, oi.spice_level
     FROM order_items oi
     LEFT JOIN items i ON i.id = oi.item_id
     WHERE oi.order_id = $1`,
    [orderId]
  );

  if (itemsResult.rows.length === 0) throw new Error('Cannot generate KOT for empty order');

  // 3. Generate KOT number
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const kotCountResult = await client.query(
    `SELECT COUNT(*) as count FROM kots WHERE kot_number LIKE $1`,
    [`KOT-${dateStr}-%`]
  );
  const kotSeq = parseInt(kotCountResult.rows[0].count) + 1;
  const kotNumber = `KOT-${dateStr}-${String(kotSeq).padStart(3, '0')}`;

  // 4. Create parent KOT
  const kotResult = await client.query(
    `INSERT INTO kots (order_id, table_id, table_number, order_phase, kot_number, status, session_id, order_type, payment_option, notes, tenant_id, outlet_id)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      orderId,
      order.table_id,
      order.table_number,
      order.order_phase,
      kotNumber,
      order.session_id,
      order.order_type || 'Dine In',
      order.payment_option || 'Pay at Restaurant',
      order.notes || null,
      order.tenant_id || 1,
      order.outlet_id || 1
    ]
  );
  const parentKot = kotResult.rows[0];

  // 5. Insert KOT items
  for (const item of itemsResult.rows) {
    await client.query(
      `INSERT INTO kot_items (kot_id, item_id, item_name, quantity, serial_number, extras, spice_level, tenant_id, outlet_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [parentKot.kot_id, item.item_id, item.item_name, item.quantity, item.serial_number, item.extras, item.spice_level, order.tenant_id || 1, order.outlet_id || 1]
    );
  }

  // 6. Group items by section (from categories)
  const itemsBySection: Record<string, { sectionName: string; items: any[] }> = {};
  for (const item of itemsResult.rows) {
    const secName = item.section_name || 'General';
    if (!itemsBySection[secName]) {
      itemsBySection[secName] = { sectionName: secName, items: [] };
    }
    itemsBySection[secName].items.push(item);
  }

  // 7. Create section KOTs
  const sectionKots = [];
  let skSeq = 1;

  for (const [sectionName, { items }] of Object.entries(itemsBySection)) {
    const sectionKotNumber = `${kotNumber}-${kitchenCode(sectionName)}-${String(skSeq).padStart(2, '0')}`;
    skSeq++;

    const skotResult = await client.query(
      `INSERT INTO section_kots (parent_kot_id, section_id, section_name, section_kot_number, status, tenant_id, outlet_id)
       VALUES ($1, NULL, $2, $3, 'pending', $4, $5) RETURNING *`,
      [parentKot.kot_id, sectionName, sectionKotNumber, order.tenant_id || 1, order.outlet_id || 1]
    );
    const skot = skotResult.rows[0];

    for (const item of items) {
      await client.query(
        `INSERT INTO section_kot_items (section_kot_id, item_id, item_name, quantity, serial_number, extras, spice_level, tenant_id, outlet_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [skot.section_kot_id, item.item_id, item.item_name, item.quantity, item.serial_number, item.extras, item.spice_level, order.tenant_id || 1, order.outlet_id || 1]
      );
    }
    sectionKots.push({
      ...skot,
      items
    });
  }

  // 8. Update order status
  await client.query(`UPDATE orders SET status = 'sent_to_kitchen' WHERE order_id = $1`, [orderId]);

  return { parentKot, sectionKots };
}
