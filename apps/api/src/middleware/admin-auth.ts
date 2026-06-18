import { NextFunction, Request, Response } from 'express';
import { pool, tenantLocalStorage } from '../db';

const ADMIN_ROLES = ['ADMIN', 'SUPERADMIN', 'MANAGER', 'STAFF'];

export async function requireAdminRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.method === 'OPTIONS') {
    next();
    return;
  }

  const authorization = req.header('authorization');
  if (!authorization) {
    res.status(401).json({ message: 'Unauthorized: missing Authorization header.' });
    return;
  }

  const roleHeader = (req.header('x-role') ?? req.header('x-user-role'))?.toUpperCase();
  if (!roleHeader || !ADMIN_ROLES.includes(roleHeader)) {
    res.status(403).json({ message: 'Forbidden: ADMIN role is required.' });
    return;
  }

  const userId = req.header('x-user-id');
  let restaurantId = 1;
  if (userId) {
    try {
      const userResult = await pool.query('SELECT get_user_restaurant_id($1) AS restaurant_id', [userId]);
      if (userResult.rows.length > 0 && userResult.rows[0].restaurant_id !== null) {
        restaurantId = userResult.rows[0].restaurant_id;
      }
    } catch (e) {
      console.error('Failed to resolve restaurant_id for user:', e);
    }
  }

  // Role-based Access Control (RBAC)
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  if (isMutation) {
    const uppercaseRole = roleHeader.toUpperCase();
    const path = req.originalUrl.toLowerCase();

    // 1. Restrict GST and Receipt layouts (settings) to ADMIN and SUPERADMIN only
    const isSettingsPath = path.includes('/api/gst-config') || 
                           path.includes('/api/extra-charges') || 
                           path.includes('/api/receipt-layout');
    
    if (isSettingsPath && (uppercaseRole === 'STAFF' || uppercaseRole === 'MANAGER')) {
      res.status(403).json({ message: 'Forbidden: Waiters and Managers cannot modify tax rates, extra charges, or layouts.' });
      return;
    }

    // 2. Restrict Items and Categories modifications to ADMIN, SUPERADMIN, and MANAGER only (no WAITER/STAFF)
    const isMenuPath = path.includes('/api/items') || path.includes('/api/categories');
    if (isMenuPath && uppercaseRole === 'STAFF') {
      res.status(403).json({ message: 'Forbidden: Waiters cannot add or modify menu items, addons, or categories.' });
      return;
    }
  }

  (req as any).restaurantId = restaurantId;
  next();
}

export const tenantContextMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const restaurantId = (req as any).restaurantId || 1;
  tenantLocalStorage.run({ restaurantId }, () => {
    next();
  });
};

export const publicTenantMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const match = req.originalUrl.match(/\/tables\/([a-fA-F0-9-]{36})/);
  let tableId = match ? match[1] : (req.query.tableId as string);

  // Fallback to referer header if tableId is not in URL or query
  if (!tableId && req.headers.referer) {
    const refererMatch = req.headers.referer.match(/\/menu\/([a-fA-F0-9-]{36})/);
    if (refererMatch) {
      tableId = refererMatch[1];
    }
  }

  let restaurantId = 1;

  if (tableId) {
    try {
      const tableCheck = await pool.query('SELECT get_table_restaurant_id($1) AS restaurant_id', [tableId]);
      if (tableCheck.rows.length > 0 && tableCheck.rows[0].restaurant_id !== null) {
        restaurantId = tableCheck.rows[0].restaurant_id;
      }
    } catch (e) {
      console.error('Failed to resolve restaurantId from tableId', e);
    }
  }

  (req as any).restaurantId = restaurantId;
  next();
};
