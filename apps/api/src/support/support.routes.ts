import { Router } from 'express';
import { pool } from '../db';
import { requireAdminRole, requirePermission } from '../middleware/admin-auth';

export const supportRouter = Router();

supportRouter.use(requireAdminRole);
// Only superadmins can manage support sessions
supportRouter.use(requirePermission('SUPERADMIN'));

// Start a support session
supportRouter.post('/sessions', async (req, res) => {
  const { tenantId, reason } = req.body;
  const adminId = (req as any).userId;

  if (!tenantId || !reason) {
    return res.status(400).json({ message: 'tenantId and reason are required' });
  }

  try {
    const result = await pool.query(`
      INSERT INTO support_sessions (tenant_id, admin_id, reason)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [tenantId, adminId, reason]);

    res.json({ success: true, session: result.rows[0] });
  } catch (error: any) {
    console.error('Failed to start support session:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// End a support session
supportRouter.post('/sessions/:id/end', async (req, res) => {
  const { id } = req.params;
  const adminId = (req as any).userId;

  try {
    const result = await pool.query(`
      UPDATE support_sessions 
      SET is_active = false, ended_at = NOW() 
      WHERE id = $1 AND admin_id = $2 AND is_active = true
      RETURNING *
    `, [id, adminId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Active support session not found' });
    }

    res.json({ success: true, session: result.rows[0] });
  } catch (error: any) {
    console.error('Failed to end support session:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get active sessions
supportRouter.get('/sessions/active', async (req, res) => {
  const adminId = (req as any).userId;

  try {
    const result = await pool.query(`
      SELECT * FROM support_sessions 
      WHERE admin_id = $1 AND is_active = true
    `, [adminId]);

    res.json({ success: true, sessions: result.rows });
  } catch (error: any) {
    console.error('Failed to fetch support sessions:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});
