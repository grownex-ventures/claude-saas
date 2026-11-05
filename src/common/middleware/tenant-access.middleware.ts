import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../database/prisma.js';
import { redis } from '../redis/redis.js';
import { tenantStatusKey } from '../redis/keys.js';

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
  const cacheKey = tenantStatusKey(tenantId);

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
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.cookies && typeof req.cookies.auth_token === 'string' && req.cookies.auth_token.trim()) {
    token = req.cookies.auth_token.trim();
  } else if (typeof req.query?.token === 'string' && req.query.token.trim()) {
    token = req.query.token.trim();
  }

  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid Bearer token' });
    return;
  }

  // Double-submit CSRF protection for cookie-authenticated mutating requests (SEC-03)
  // If authenticated via cookie without explicit Authorization header, require matching X-CSRF-Token
  const method = (req.method || 'GET').toUpperCase();
  const isMutatingMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  const isCookieAuth = Boolean(!authHeader && req.cookies && req.cookies.auth_token);

  if (isMutatingMethod && isCookieAuth) {
    const headerCsrf = req.headers['x-csrf-token'];
    const cookieCsrf = req.cookies?.csrf_token;
    if (!headerCsrf || !cookieCsrf || headerCsrf !== cookieCsrf) {
      res.status(403).json({
        error: 'Forbidden: CSRF token missing or mismatch',
        code: 'EBADCSRFTOKEN'
      });
      return;
    }
  }
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
