import { NextFunction, Request, Response } from 'express';

const ADMIN_ROLES = ['ADMIN', 'SUPERADMIN', 'MANAGER', 'STAFF'];

export function requireAdminRole(req: Request, res: Response, next: NextFunction): void {
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

  next();
}
