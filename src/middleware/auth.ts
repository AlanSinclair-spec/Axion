import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../config/database';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    companyId?: string;
    role: string;
  };
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

    // Verify user still exists and is active
    const result = await query(
      'SELECT id, email, company_id, role, is_active FROM users WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return res.status(401).json({ error: 'Invalid token.' });
    }

    req.user = {
      id: result.rows[0].id,
      email: result.rows[0].email,
      companyId: result.rows[0].company_id,
      role: result.rows[0].role
    };

    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token.' });
  }
};

export const authorize = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }

    next();
  };
};

export const validateCompanyAccess = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const companyId = req.params.companyId || req.body.companyId;

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    // Super admins can access any company
    if (req.user.role === 'super_admin') {
      return next();
    }

    // Regular users can only access their own company
    if (req.user.companyId !== companyId) {
      return res.status(403).json({ error: 'Access denied to this company.' });
    }

    next();
  } catch (error) {
    res.status(500).json({ error: 'Authorization check failed.' });
  }
};