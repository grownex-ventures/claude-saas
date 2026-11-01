import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../database/prisma.js';
import { redis } from '../redis/redis.js';

export interface AuthenticatedRequest extends Request {
  tenantId?: string;
}

export interface JwtTenantPayload {
  tenantId?: string;
  sub?: string;
  email?: string;
  [key: string]: any;
}

/**
 * Checks Redis key tenant:${tenantId}:status.
 * On Redis miss, queries prisma.tenant.findUnique({ where: { id: tenantId } })
 * and caches subscriptionStatus in Redis with TTL 3600 seconds.
 */
export async function verifyActiveSubscription(tenantId: string): Promise<boolean> {
  const cacheKey = `tenant:${tenantId}:status`;

  try {
    const cachedStatus = await redis.get(cacheKey);
    if (cachedStatus !== null) {
      return cachedStatus === 'ACTIVE';
    }
  } catch (err) {
    // If Redis encounters a transient connection error, fallback directly to database
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId }
  });

  if (!tenant) {
    return false;
  }

  try {
    await redis.set(cacheKey, tenant.subscriptionStatus, 'EX', 3600);
  } catch (err) {
    // Non-blocking cache error
  }

  return tenant.subscriptionStatus === 'ACTIVE';
}

/**
 * Authenticates incoming admin dashboard requests using JWT (Authorization: Bearer <token>)
 * and attaches req.tenantId.
 */
export function tenantAccessMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid Bearer token' });
    return;
  }

  const token = authHeader.substring(7).trim();
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && (!secret || secret === 'super-secret-jwt-key-for-tenant-admin' || secret.length < 32)) {
    res.status(500).json({ error: 'Server misconfiguration: Secure JWT_SECRET required' });
    return;
  }
  const jwtSecret = secret || 'super-secret-jwt-key-for-tenant-admin';

  try {
    const decoded = jwt.verify(token, jwtSecret) as JwtTenantPayload;
    const resolvedTenantId = decoded.tenantId || decoded.sub;

    if (!resolvedTenantId) {
      res.status(401).json({ error: 'Unauthorized: Token payload missing tenantId' });
      return;
    }

    req.tenantId = resolvedTenantId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized: Invalid token signature or expired' });
  }
}
