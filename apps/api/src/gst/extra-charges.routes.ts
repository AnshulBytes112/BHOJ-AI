import { Router } from 'express';
import { pool } from '../db';

type ExtraChargeRow = {
  id: number;
  name: string;
  charge_type: 'percentage' | 'fixed';
  value: string;
  is_active: boolean;
  apply_on: 'always' | 'dine_in' | 'parcel' | 'delivery' | 'takeaway' | 'never';
  is_taxable: boolean;
  created_at: Date;
  updated_at: Date;
};

const VALID_APPLY_ON = ['always', 'dine_in', 'parcel', 'delivery', 'takeaway', 'never'] as const;

export const extraChargesRouter = Router();

// GET /api/extra-charges - list all charges
extraChargesRouter.get('/', async (_req, res) => {
  try {
    const result = await pool.query<ExtraChargeRow>(
      'SELECT * FROM extra_charges ORDER BY is_active DESC, updated_at DESC;'
    );
    res.json(result.rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch extra charges.';
    res.status(400).json({ message });
  }
});

// POST /api/extra-charges - create extra charge
extraChargesRouter.post('/', async (req, res) => {
  const { name, charge_type, value, is_active, apply_on, is_taxable } = req.body;

  if (!name || !charge_type || value === undefined) {
    res.status(400).json({ message: 'Name, charge type, and value are required.' });
    return;
  }

  if (charge_type !== 'percentage' && charge_type !== 'fixed') {
    res.status(400).json({ message: "Charge type must be either 'percentage' or 'fixed'." });
    return;
  }

  const valNum = Number(value);
  if (!Number.isFinite(valNum) || valNum < 0) {
    res.status(400).json({ message: 'Value must be a non-negative number.' });
    return;
  }

  const applyOn = apply_on && VALID_APPLY_ON.includes(apply_on) ? apply_on : 'always';
  const isTaxable = is_taxable === true || is_taxable === 'true';

  try {
    const result = await pool.query<ExtraChargeRow>(
      `INSERT INTO extra_charges (name, charge_type, value, is_active, apply_on, is_taxable)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *;`,
      [name, charge_type, valNum, is_active ?? true, applyOn, isTaxable]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create extra charge.';
    res.status(400).json({ message });
  }
});

// PUT /api/extra-charges/:id - update charge
extraChargesRouter.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { name, charge_type, value, is_active, apply_on, is_taxable } = req.body;

  if (!name || !charge_type || value === undefined) {
    res.status(400).json({ message: 'Name, charge type, and value are required.' });
    return;
  }

  if (charge_type !== 'percentage' && charge_type !== 'fixed') {
    res.status(400).json({ message: "Charge type must be either 'percentage' or 'fixed'." });
    return;
  }

  const valNum = Number(value);
  if (!Number.isFinite(valNum) || valNum < 0) {
    res.status(400).json({ message: 'Value must be a non-negative number.' });
    return;
  }

  const applyOn = apply_on && VALID_APPLY_ON.includes(apply_on) ? apply_on : 'always';
  const isTaxable = is_taxable === true || is_taxable === 'true';

  try {
    const result = await pool.query<ExtraChargeRow>(
      `UPDATE extra_charges
       SET name = $1, charge_type = $2, value = $3, is_active = $4,
           apply_on = $5, is_taxable = $6, updated_at = NOW()
       WHERE id = $7
       RETURNING *;`,
      [name, charge_type, valNum, is_active, applyOn, isTaxable, id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ message: 'Extra charge not found.' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update extra charge.';
    res.status(400).json({ message });
  }
});

// DELETE /api/extra-charges/:id - soft delete/deactivate
extraChargesRouter.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);

  try {
    const result = await pool.query<ExtraChargeRow>(
      'UPDATE extra_charges SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *;',
      [id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ message: 'Extra charge not found.' });
      return;
    }

    res.json({ message: 'Extra charge deactivated successfully.', charge: result.rows[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to deactivate extra charge.';
    res.status(400).json({ message });
  }
});


