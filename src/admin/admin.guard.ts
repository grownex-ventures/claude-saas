import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../common/database/prisma.js';

export interface AdminPayload {
  id: string;
  email: string;
  name: string;
  role: 'superadmin';
}

declare global {
  namespace Express {
    interface Request {
      admin?: AdminPayload;
    }
  }
}

export function getAdminJwtSecret(): string {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret.length < 32 || secret === process.env.JWT_SECRET) {
      throw new Error('[FATAL] ADMIN_JWT_SECRET must be configured independently with at least 32 characters in production.');
    }
    return secret;
  }
  if (secret && secret.length >= 32) {
    return secret;
  }
  if (process.env.NODE_ENV === 'test') {
    return 'super_admin_test_secret_key_minimum_32_chars';
  }
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32) {
    return `${process.env.JWT_SECRET}_admin`;
  }
  return 'super_admin_dev_secret_key_minimum_32_chars';
}

/**
 * Super Admin Authentication Guard
 * Validates admin JWT from HTTP-only cookie 'admin_token' or 'Authorization: Bearer <token>'
 */
export async function adminAuthGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let token: string | undefined;

    // 1. Check HTTP-only cookie
    if (req.cookies && req.cookies.admin_token) {
      token = req.cookies.admin_token;
    }

    // 2. Check Authorization header
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.slice(7).trim();
    }

    if (!token) {
      res.status(401).json({ error: 'Super Admin authentication required', code: 'ADMIN_UNAUTHORIZED' });
      return;
    }

    const secret = getAdminJwtSecret();
    const decoded = jwt.verify(token, secret) as AdminPayload;

    if (!decoded || !decoded.id || decoded.role !== 'superadmin') {
      res.status(401).json({ error: 'Invalid admin token claims', code: 'ADMIN_INVALID_TOKEN' });
      return;
    }

    // Verify admin still exists in database
    const adminUser = await prisma.adminUser.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, name: true }
    });

    if (!adminUser) {
      res.status(401).json({ error: 'Admin account not found', code: 'ADMIN_NOT_FOUND' });
      return;
    }

    req.admin = {
      id: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
      role: 'superadmin'
    };

    // Double-submit CSRF protection for cookie-authenticated mutating requests (POST, PUT, PATCH, DELETE)
    const method = (req.method || 'GET').toUpperCase();
    const isMutatingMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const authHeader = req.headers.authorization;
    const isCookieAuth = Boolean(!authHeader && req.cookies && req.cookies.admin_token);

    if (isMutatingMethod && isCookieAuth) {
      const headerCsrf = req.headers['x-csrf-token'];
      const cookieCsrf = req.cookies?.admin_csrf_token;
      if (!headerCsrf || !cookieCsrf || headerCsrf !== cookieCsrf) {
        res.status(403).json({
          error: 'Forbidden: Admin CSRF token missing or mismatch',
          code: 'EBADCSRFTOKEN'
        });
        return;
      }
    }

    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Admin session expired, please log in again', code: 'ADMIN_TOKEN_EXPIRED' });
      return;
    }
    res.status(401).json({ error: 'Invalid admin session', code: 'ADMIN_UNAUTHORIZED' });
  }
}

