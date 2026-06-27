import { NextFunction, Request, Response } from 'express';
import { pool, tenantLocalStorage } from '../db';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-development-only';

export async function requireAdminRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.method === 'OPTIONS') {
    next();
    return;
  }

  const authorization = req.header('authorization');
  if (!authorization || !authorization.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Unauthorized: missing or invalid Authorization header.' });
    return;
  }

  const token = authorization.split(' ')[1];
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    // Inject tenant context into request object
    (req as any).tenantId = decoded.tenant_id;
    (req as any).outletId = decoded.outlet_id;
    (req as any).userId = decoded.id;
    (req as any).userRole = decoded.role;
    
    next();
  } catch (err) {
    res.status(401).json({ message: 'Unauthorized: invalid token.' });
  }
}

export function requirePermission(permissionName: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const role = (req as any).userRole;
    if (!role) {
      return res.status(403).json({ message: 'Forbidden: No role assigned.' });
    }

    if (role === 'SUPERADMIN') {
      return next();
    }

    try {
      const permCheck = await pool.query(`
        SELECT 1 FROM role_permissions rp
        JOIN permissions p ON p.id = rp.permission_id
        WHERE rp.role = $1 AND p.name = $2
      `, [role, permissionName]);

      if (permCheck.rows.length === 0) {
        return res.status(403).json({ message: \`Forbidden: Requires permission \${permissionName}\` });
      }

      next();
    } catch (e) {
      res.status(500).json({ message: 'Internal server error while checking permissions.' });
    }
  };
}

export const tenantContextMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const tenantId = (req as any).tenantId;
  const outletId = (req as any).outletId;
  const restaurantId = (req as any).restaurantId; // fallback for legacy code during migration

  tenantLocalStorage.run({ tenantId, outletId, restaurantId }, () => {
    next();
  });
};

export const publicTenantMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const match = req.originalUrl.match(/\/tables\/([a-fA-F0-9-]{36})/);
  let tableId = match ? match[1] : (req.query.tableId as string);

  if (!tableId && req.headers.referer) {
    const refererMatch = req.headers.referer.match(/\/menu\/([a-fA-F0-9-]{36})/);
    if (refererMatch) {
      tableId = refererMatch[1];
    }
  }

  let tenantId = 1; // Fallback default
  let outletId = 1;

  if (tableId) {
    try {
      // Find the tenant and outlet based on the table's assigned outlet
      const tableCheck = await pool.query('SELECT tenant_id, outlet_id FROM tables WHERE table_id = $1 LIMIT 1', [tableId]);
      if (tableCheck.rows.length > 0) {
        tenantId = tableCheck.rows[0].tenant_id;
        outletId = tableCheck.rows[0].outlet_id;
      }
    } catch (e) {
      console.error('Failed to resolve tenant context from tableId', e);
    }
  }

  (req as any).tenantId = tenantId;
  (req as any).outletId = outletId;
  next();
};
