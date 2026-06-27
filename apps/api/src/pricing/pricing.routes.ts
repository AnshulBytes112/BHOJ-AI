import { Router } from 'express';
import { pool } from '../db';

export const pricingRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// DINING ZONES — CRUD
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/pricing/zones
pricingRouter.get('/zones', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT zone_id, name, description, is_active, created_at, updated_at
      FROM dining_zones
      ORDER BY is_active DESC, name ASC
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Failed to fetch zones' });
  }
});

// POST /api/pricing/zones
pricingRouter.post('/zones', async (req, res) => {
  const { name, description, is_active } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ message: 'Zone name is required.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO dining_zones (name, description, is_active)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name.trim(), description || null, is_active !== false]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Failed to create zone' });
  }
});

// PUT /api/pricing/zones/:id
pricingRouter.put('/zones/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, is_active } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ message: 'Zone name is required.' });
  }
  try {
    const result = await pool.query(
      `UPDATE dining_zones
       SET name = $1, description = $2, is_active = $3, updated_at = NOW()
       WHERE zone_id = $4
       RETURNING *`,
      [name.trim(), description || null, is_active !== false, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'Zone not found.' });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Failed to update zone' });
  }
});

// DELETE /api/pricing/zones/:id — hard delete
pricingRouter.delete('/zones/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM dining_zones WHERE zone_id = $1 RETURNING *`,
      [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'Zone not found.' });
    res.json({ message: 'Zone deleted.', zone: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Failed to delete zone' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ZONE ITEM PRICES — bulk get + bulk upsert
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/pricing/zones/:id/prices — items with optional zone override
pricingRouter.get('/zones/:id/prices', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT i.id as item_id, i.name as item_name, i.category,
              i.selling_price as base_price,
              izp.price as zone_price,
              izp.id as override_id
       FROM items i
       LEFT JOIN item_zone_prices izp
         ON izp.item_id = i.id AND izp.zone_id = $1
       WHERE i.is_active = true
       ORDER BY i.category, i.name`,
      [id]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Failed to fetch zone prices' });
  }
});

// PUT /api/pricing/zones/:id/prices — bulk upsert
// Body: { prices: [{ item_id, price }] }
// Send price = null to remove override for that item
pricingRouter.put('/zones/:id/prices', async (req, res) => {
  const { id: zoneId } = req.params;
  const { prices } = req.body;

  if (!Array.isArray(prices)) {
    return res.status(400).json({ message: 'prices must be an array.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify zone exists
    const zoneCheck = await client.query(`SELECT zone_id FROM dining_zones WHERE zone_id = $1`, [zoneId]);
    if (zoneCheck.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Zone not found.' });
    }

    let upserted = 0;
    let removed = 0;

    for (const entry of prices) {
      const itemId = Number(entry.item_id);
      if (!Number.isInteger(itemId) || itemId <= 0) continue;

      if (entry.price === null || entry.price === undefined || entry.price === '') {
        // Remove override
        const del = await client.query(
          `DELETE FROM item_zone_prices WHERE item_id = $1 AND zone_id = $2`,
          [itemId, zoneId]
        );
        removed += del.rowCount ?? 0;
      } else {
        const price = Number(entry.price);
        if (!Number.isFinite(price) || price < 0) continue;
        await client.query(
          `INSERT INTO item_zone_prices (item_id, zone_id, price, restaurant_id)
           VALUES ($1, $2, $3, 1)
           ON CONFLICT (item_id, zone_id)
           DO UPDATE SET price = $3, updated_at = NOW()`,
          [itemId, zoneId, price]
        );
        upserted++;
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Zone prices updated.', upserted, removed });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: err.message || 'Failed to update zone prices' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TABLE-TO-ZONE ASSIGNMENT
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/pricing/table-zones — all tables with their assigned zone
pricingRouter.get('/table-zones', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.table_id, t.table_number, t.zone_id,
             dz.name as zone_name
      FROM tables t
      LEFT JOIN dining_zones dz ON dz.zone_id = t.zone_id
      ORDER BY t.table_number::integer
    `);
    res.json(result.rows);
  } catch (err: any) {
    // Fallback for non-numeric table numbers
    try {
      const result = await pool.query(`
        SELECT t.table_id, t.table_number, t.zone_id,
               dz.name as zone_name
        FROM tables t
        LEFT JOIN dining_zones dz ON dz.zone_id = t.zone_id
        ORDER BY t.table_number
      `);
      res.json(result.rows);
    } catch (e2: any) {
      res.status(500).json({ message: e2.message || 'Failed to fetch table zones' });
    }
  }
});

// PUT /api/pricing/table-zones — bulk assign zones to tables
// Body: { assignments: [{ table_id, zone_id }] }  zone_id = null to clear
pricingRouter.put('/table-zones', async (req, res) => {
  const { assignments } = req.body;
  if (!Array.isArray(assignments)) {
    return res.status(400).json({ message: 'assignments must be an array.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const a of assignments) {
      if (!a.table_id) continue;
      await client.query(
        `UPDATE tables SET zone_id = $1, updated_at = NOW() WHERE table_id = $2`,
        [a.zone_id || null, a.table_id]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Table zone assignments updated.', count: assignments.length });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: err.message || 'Failed to update table zones' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MENU SCHEDULES — CRUD
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/pricing/schedules
pricingRouter.get('/schedules', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT schedule_id, name, start_time, end_time, days_of_week, is_active, created_at, updated_at
      FROM menu_schedules
      ORDER BY is_active DESC, start_time ASC
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Failed to fetch schedules' });
  }
});

// POST /api/pricing/schedules
pricingRouter.post('/schedules', async (req, res) => {
  const { name, start_time, end_time, days_of_week, is_active } = req.body;
  if (!name?.trim() || !start_time || !end_time) {
    return res.status(400).json({ message: 'name, start_time, and end_time are required.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO menu_schedules (name, start_time, end_time, days_of_week, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name.trim(), start_time, end_time, days_of_week || [0,1,2,3,4,5,6], is_active !== false]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Failed to create schedule' });
  }
});

// PUT /api/pricing/schedules/:id
pricingRouter.put('/schedules/:id', async (req, res) => {
  const { id } = req.params;
  const { name, start_time, end_time, days_of_week, is_active } = req.body;
  if (!name?.trim() || !start_time || !end_time) {
    return res.status(400).json({ message: 'name, start_time, and end_time are required.' });
  }
  try {
    const result = await pool.query(
      `UPDATE menu_schedules
       SET name = $1, start_time = $2, end_time = $3,
           days_of_week = $4, is_active = $5, updated_at = NOW()
       WHERE schedule_id = $6
       RETURNING *`,
      [name.trim(), start_time, end_time, days_of_week || [0,1,2,3,4,5,6], is_active !== false, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'Schedule not found.' });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Failed to update schedule' });
  }
});

// DELETE /api/pricing/schedules/:id — hard delete
pricingRouter.delete('/schedules/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM menu_schedules WHERE schedule_id = $1 RETURNING *`,
      [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'Schedule not found.' });
    res.json({ message: 'Schedule deleted.', schedule: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Failed to delete schedule' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULE ITEM PRICES — bulk get + bulk upsert
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/pricing/schedules/:id/prices
pricingRouter.get('/schedules/:id/prices', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT i.id as item_id, i.name as item_name, i.category,
              i.selling_price as base_price,
              isp.price as schedule_price,
              isp.id as override_id
       FROM items i
       LEFT JOIN item_schedule_prices isp
         ON isp.item_id = i.id AND isp.schedule_id = $1
       WHERE i.is_active = true
       ORDER BY i.category, i.name`,
      [id]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Failed to fetch schedule prices' });
  }
});

// PUT /api/pricing/schedules/:id/prices — bulk upsert
pricingRouter.put('/schedules/:id/prices', async (req, res) => {
  const { id: scheduleId } = req.params;
  const { prices } = req.body;

  if (!Array.isArray(prices)) {
    return res.status(400).json({ message: 'prices must be an array.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const schedCheck = await client.query(
      `SELECT schedule_id FROM menu_schedules WHERE schedule_id = $1`, [scheduleId]
    );
    if (schedCheck.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Schedule not found.' });
    }

    let upserted = 0;
    let removed = 0;

    for (const entry of prices) {
      const itemId = Number(entry.item_id);
      if (!Number.isInteger(itemId) || itemId <= 0) continue;

      if (entry.price === null || entry.price === undefined || entry.price === '') {
        const del = await client.query(
          `DELETE FROM item_schedule_prices WHERE item_id = $1 AND schedule_id = $2`,
          [itemId, scheduleId]
        );
        removed += del.rowCount ?? 0;
      } else {
        const price = Number(entry.price);
        if (!Number.isFinite(price) || price < 0) continue;
        await client.query(
          `INSERT INTO item_schedule_prices (item_id, schedule_id, price, restaurant_id)
           VALUES ($1, $2, $3, 1)
           ON CONFLICT (item_id, schedule_id)
           DO UPDATE SET price = $3`,
          [itemId, scheduleId, price]
        );
        upserted++;
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Schedule prices updated.', upserted, removed });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: err.message || 'Failed to update schedule prices' });
  } finally {
    client.release();
  }
});
