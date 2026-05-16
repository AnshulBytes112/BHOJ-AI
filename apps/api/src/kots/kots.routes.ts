import { Router } from 'express';
import { pool } from '../db';

export const kotsRouter = Router();

// GET /kots - list all KOTs
kotsRouter.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT k.kot_id, k.order_id, k.table_id, k.table_number, k.order_phase,
              k.kot_number, k.status, k.generated_at
       FROM kots k ORDER BY k.generated_at DESC`
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /kots error:', err);
    res.status(500).json({ message: 'Failed to fetch KOTs' });
  }
});

// GET /kots/:kotId/sections - get all section KOTs for a parent KOT
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

// GET /kots/section/:sectionId - get all section KOTs for a given kitchen section
kotsRouter.get('/section/:sectionId', async (req, res) => {
  const { sectionId } = req.params;
  try {
    const skotsResult = await pool.query(
      `SELECT sk.section_kot_id, sk.parent_kot_id, sk.section_id, sk.section_name,
              sk.section_kot_number, sk.status, sk.generated_at,
              k.table_number, k.kot_number, k.order_phase
       FROM section_kots sk
       LEFT JOIN kots k ON k.kot_id = sk.parent_kot_id
       WHERE sk.section_name = $1
       ORDER BY sk.generated_at DESC`,
      [sectionId]
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
    console.error('GET /kots/section/:sectionId error:', err);
    res.status(500).json({ message: 'Failed to fetch section KOTs' });
  }
});

// POST /kots/section-kots/:sectionKotId/status - update section KOT status
kotsRouter.post('/section-kots/:sectionKotId/status', async (req, res) => {
  const { sectionKotId } = req.params;
  const { status } = req.body;

  const validStatuses = ['pending', 'acknowledged', 'completed'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ message: `status must be one of: ${validStatuses.join(', ')}` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const skotResult = await client.query(
      `UPDATE section_kots SET status = $1 WHERE section_kot_id = $2 RETURNING *`,
      [status, sectionKotId]
    );
    if (skotResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Section KOT not found' });
    }

    const skot = skotResult.rows[0];

    // Update parent KOT status based on all children
    const siblings = await client.query(
      `SELECT status FROM section_kots WHERE parent_kot_id = $1`,
      [skot.parent_kot_id]
    );
    const siblingStatuses = siblings.rows.map((r: any) => r.status);

    let parentStatus: string | null = null;
    if (siblingStatuses.every((s: string) => s === 'completed')) {
      parentStatus = 'completed';
    } else if (siblingStatuses.every((s: string) => s === 'acknowledged' || s === 'completed')) {
      parentStatus = 'acknowledged';
    }

    if (parentStatus) {
      await client.query(`UPDATE kots SET status = $1 WHERE kot_id = $2`, [parentStatus, skot.parent_kot_id]);
    }

    await client.query('COMMIT');
    res.json({ ...skot, parentStatus });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('POST /kots/section-kots/:sectionKotId/status error:', err);
    res.status(500).json({ message: 'Failed to update section KOT status' });
  } finally {
    client.release();
  }
});

// GET /kots/sections - list all kitchen sections (based on POS categories) with their active KOTs count
kotsRouter.get('/sections/list', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.name as section_id, c.name as section_name, c.name as description, c.is_active,
              COUNT(sk.section_kot_id) FILTER (WHERE sk.status = 'pending') as pending_count
       FROM categories c
       LEFT JOIN section_kots sk ON sk.section_name = c.name
       WHERE c.is_active = true
       GROUP BY c.name ORDER BY c.name`
    );

    // Fallback: if no categories exist, pull distinct section names from section_kots
    if (result.rows.length === 0) {
      const fallback = await pool.query(
        `SELECT DISTINCT section_name as section_id, section_name,
                COUNT(*) FILTER (WHERE status = 'pending') as pending_count
         FROM section_kots
         GROUP BY section_name ORDER BY section_name`
      );
      return res.json(fallback.rows);
    }

    res.json(result.rows);
  } catch (err: any) {
    console.error('GET /kots/sections/list error:', err);
    res.status(500).json({ message: 'Failed to fetch sections' });
  }
});
