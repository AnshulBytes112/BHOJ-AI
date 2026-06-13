import { Router } from 'express';
import { randomUUID } from 'crypto';
import { pool } from '../db';

type StockType = 'limited' | 'unlimited';

type ItemRow = {
  id: number;
  serial_number: string;
  name: string;
  selling_price: string;
  category: string;
  stock_quantity: number;
  is_active: boolean;
  stock_type: StockType;
  image_url: string | null;
  created_at: Date;
  updated_at: Date;
};

type ItemPayload = {
  name?: string;
  selling_price?: number;
  category?: string;
  stock_quantity?: number;
  is_active?: boolean;
  stock_type?: StockType;
  image_url?: string | null;
  addons?: Array<{ name: string; price: number }>;
};

const IMMUTABLE_FIELDS = new Set(['id', 'serial_number', 'created_at', 'updated_at']);
const ALLOWED_MUTABLE_FIELDS = new Set([
  'name',
  'selling_price',
  'category',
  'stock_quantity',
  'is_active',
  'stock_type',
  'image_url',
  'addons',
]);

async function ensureCategoryExists(category: string): Promise<void> {
  const result = await pool.query<{ id: number }>(
    'SELECT id FROM categories WHERE LOWER(name) = LOWER($1) AND is_active = true LIMIT 1;',
    [category]
  );

  if (result.rowCount === 0) {
    throw new Error('category does not exist in active categories list.');
  }
}

function hasImmutableField(body: Record<string, unknown>): string | null {
  for (const key of Object.keys(body)) {
    if (IMMUTABLE_FIELDS.has(key)) {
      return key;
    }
  }
  return null;
}

function parseBooleanQuery(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') {
      return true;
    }
    if (value.toLowerCase() === 'false') {
      return false;
    }
  }

  throw new Error('is_active must be true or false when provided.');
}

function parseItemPayload(rawBody: unknown, allowPartial: boolean): ItemPayload {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    throw new Error('Request body must be a valid object.');
  }

  const body = rawBody as Record<string, unknown>;

  for (const key of Object.keys(body)) {
    if (!ALLOWED_MUTABLE_FIELDS.has(key) && !IMMUTABLE_FIELDS.has(key)) {
      throw new Error(`${key} is not an allowed field.`);
    }
  }

  const immutableField = hasImmutableField(body);
  if (immutableField) {
    throw new Error(`${immutableField} is immutable and cannot be set.`);
  }

  const parsed: ItemPayload = {};

  if ('name' in body) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      throw new Error('name must be a non-empty string.');
    }
    parsed.name = body.name.trim();
  }

  if ('selling_price' in body) {
    const num = Number(body.selling_price);
    if (!Number.isFinite(num) || num < 0) {
      throw new Error('selling_price must be a valid non-negative number.');
    }
    parsed.selling_price = Number(num.toFixed(2));
  }

  if ('category' in body) {
    if (typeof body.category !== 'string' || body.category.trim().length === 0) {
      throw new Error('category must be a non-empty string.');
    }
    parsed.category = body.category.trim();
  }

  if ('stock_quantity' in body) {
    const qty = Number(body.stock_quantity);
    if (!Number.isInteger(qty) || qty < 0) {
      throw new Error('stock_quantity must be an integer greater than or equal to 0.');
    }
    parsed.stock_quantity = qty;
  }

  if ('is_active' in body) {
    if (typeof body.is_active !== 'boolean') {
      throw new Error('is_active must be a boolean.');
    }
    parsed.is_active = body.is_active;
  }

  if ('stock_type' in body) {
    if (body.stock_type !== 'limited' && body.stock_type !== 'unlimited') {
      throw new Error("stock_type must be either 'limited' or 'unlimited'.");
    }
    parsed.stock_type = body.stock_type;
  }

  if ('image_url' in body) {
    if (body.image_url !== null && typeof body.image_url !== 'string') {
      throw new Error('image_url must be a string or null.');
    }
    parsed.image_url = body.image_url as string | null;
  }

  if ('addons' in body) {
    if (!Array.isArray(body.addons)) {
      throw new Error('addons must be a valid array.');
    }
    parsed.addons = body.addons.map((a: any, i) => {
      if (!a || typeof a !== 'object') {
        throw new Error(`Addon at index ${i} must be an object.`);
      }
      if (typeof a.name !== 'string' || a.name.trim().length === 0) {
        throw new Error(`Addon at index ${i} must have a non-empty name.`);
      }
      const p = Number(a.price);
      if (!Number.isFinite(p) || p < 0) {
        throw new Error(`Addon at index ${i} must have a valid non-negative price.`);
      }
      return {
        name: a.name.trim(),
        price: Number(p.toFixed(2)),
      };
    });
  }

  if (!allowPartial) {
    if (
      !parsed.name ||
      parsed.selling_price === undefined ||
      !parsed.category ||
      !parsed.stock_type ||
      parsed.stock_quantity === undefined
    ) {
      throw new Error('name, selling_price, category, stock_type, and stock_quantity are required.');
    }
  }

  if (allowPartial && Object.keys(parsed).length === 0) {
    throw new Error('At least one mutable field is required for update.');
  }

  return parsed;
}

export const itemsRouter = Router();

itemsRouter.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const payload = parseItemPayload(req.body, false);
    await ensureCategoryExists(payload.category as string);

    await client.query('BEGIN');

    const result = await client.query<ItemRow>(
      `
      INSERT INTO items (serial_number, name, selling_price, category, stock_quantity, is_active, stock_type, image_url)
      VALUES ($1, $2, $3, $4, $5, COALESCE($6, true), $7, $8)
      RETURNING *;
      `,
      [
        randomUUID(),
        payload.name,
        payload.selling_price,
        payload.category,
        payload.stock_quantity,
        payload.is_active,
        payload.stock_type,
        payload.image_url ?? null,
      ]
    );

    const newItem = result.rows[0];

    // Insert addons if provided
    const addonsResult: any[] = [];
    if (payload.addons && payload.addons.length > 0) {
      for (const addon of payload.addons) {
        const addonInsert = await client.query(
          `INSERT INTO item_addons (item_id, name, price)
           VALUES ($1, $2, $3)
           RETURNING id, name, price, is_active`,
          [newItem.id, addon.name, addon.price]
        );
        addonsResult.push(addonInsert.rows[0]);
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ ...newItem, addons: addonsResult });
  } catch (error) {
    await client.query('ROLLBACK');
    const message = error instanceof Error ? error.message : 'Failed to create item.';
    res.status(400).json({ message });
  } finally {
    client.release();
  }
});

itemsRouter.get('/', async (req, res) => {
  try {
    const whereParts: string[] = [];
    const params: Array<string | boolean> = [];

    if (typeof req.query.category === 'string' && req.query.category.trim()) {
      params.push(req.query.category.trim());
      whereParts.push(`i.category = $${params.length}`);
    }

    const isActive = parseBooleanQuery(req.query.is_active);
    if (isActive !== undefined) {
      params.push(isActive);
      whereParts.push(`i.is_active = $${params.length}`);
    }

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    const result = await pool.query<ItemRow>(
      `
      SELECT i.*,
             COALESCE(
               (
                 SELECT json_agg(json_build_object('id', ia.id, 'name', ia.name, 'price', ia.price, 'is_active', ia.is_active))
                 FROM item_addons ia
                 WHERE ia.item_id = i.id
               ),
               '[]'::json
             ) as addons
      FROM items i
      ${whereClause}
      ORDER BY i.id ASC;
      `,
      params
    );

    res.json(result.rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch items.';
    res.status(400).json({ message });
  }
});

itemsRouter.get('/:id', async (req, res) => {
  const itemId = Number(req.params.id);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    res.status(400).json({ message: 'id must be a positive integer.' });
    return;
  }

  const result = await pool.query<ItemRow>(
    `
    SELECT i.*,
           COALESCE(
             (
               SELECT json_agg(json_build_object('id', ia.id, 'name', ia.name, 'price', ia.price, 'is_active', ia.is_active))
               FROM item_addons ia
               WHERE ia.item_id = i.id
             ),
             '[]'::json
           ) as addons
    FROM items i
    WHERE i.id = $1;
    `,
    [itemId]
  );
  if (result.rowCount === 0) {
    res.status(404).json({ message: 'Item not found.' });
    return;
  }

  res.json(result.rows[0]);
});

itemsRouter.put('/:id', async (req, res) => {
  const itemId = Number(req.params.id);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    res.status(400).json({ message: 'id must be a positive integer.' });
    return;
  }

  const client = await pool.connect();
  try {
    const payload = parseItemPayload(req.body, true);
    if (payload.category) {
      await ensureCategoryExists(payload.category);
    }

    await client.query('BEGIN');

    // Filter out addons from the updates list for the items table
    const updates: string[] = [];
    const values: Array<string | number | boolean | null> = [];

    const allowedEntries = Object.entries(payload) as Array<[keyof ItemPayload, any]>;
    for (const [key, value] of allowedEntries) {
      if (key === 'addons') continue;
      updates.push(`${key} = $${values.length + 1}`);
      values.push(value);
    }

    let updatedItem: any;

    if (updates.length > 0) {
      values.push(itemId);
      const result = await client.query<ItemRow>(
        `
        UPDATE items
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${values.length}
        RETURNING *;
        `,
        values
      );

      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ message: 'Item not found.' });
        return;
      }
      updatedItem = result.rows[0];
    } else {
      // If only addons are being updated
      const itemCheck = await client.query('SELECT * FROM items WHERE id = $1', [itemId]);
      if (itemCheck.rowCount === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ message: 'Item not found.' });
        return;
      }
      updatedItem = itemCheck.rows[0];
    }

    // Handle addons if provided
    if ('addons' in payload) {
      // Delete old addons
      await client.query('DELETE FROM item_addons WHERE item_id = $1', [itemId]);

      // Insert new addons
      const addonsResult: any[] = [];
      if (payload.addons && payload.addons.length > 0) {
        for (const addon of payload.addons) {
          const addonInsert = await client.query(
            `INSERT INTO item_addons (item_id, name, price)
             VALUES ($1, $2, $3)
             RETURNING id, name, price, is_active`,
            [itemId, addon.name, addon.price]
          );
          addonsResult.push(addonInsert.rows[0]);
        }
      }
      updatedItem.addons = addonsResult;
    } else {
      // If addons not provided in update, fetch existing ones to return
      const addonsCheck = await client.query('SELECT id, name, price, is_active FROM item_addons WHERE item_id = $1', [itemId]);
      updatedItem.addons = addonsCheck.rows;
    }

    await client.query('COMMIT');
    res.json(updatedItem);
  } catch (error) {
    await client.query('ROLLBACK');
    const message = error instanceof Error ? error.message : 'Failed to update item.';
    res.status(400).json({ message });
  } finally {
    client.release();
  }
});


itemsRouter.delete('/:id', async (req, res) => {
  const itemId = Number(req.params.id);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    res.status(400).json({ message: 'id must be a positive integer.' });
    return;
  }

  try {
    const result = await pool.query<ItemRow>(
      'DELETE FROM items WHERE id = $1 RETURNING *;',
      [itemId]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ message: 'Item not found.' });
      return;
    }

    res.json({ message: 'Item deleted permanently.', item: result.rows[0] });
  } catch (error: any) {
    // Check for foreign key constraint violation (PostgreSQL error code 23503)
    if (error.code === '23503') {
      res.status(400).json({ 
        message: 'Cannot delete this item because it is referenced in existing bills. Please deactivate it instead.' 
      });
      return;
    }
    
    const message = error instanceof Error ? error.message : 'Failed to delete item.';
    res.status(500).json({ message });
  }
});
