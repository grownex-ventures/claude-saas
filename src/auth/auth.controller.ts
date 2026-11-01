import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { authService } from './auth.service.js';
import { tenantAccessMiddleware, AuthenticatedRequest } from '../common/middleware/tenant-access.middleware.js';
import { prisma } from '../common/database/prisma.js';
import { AuditLogService } from '../common/audit/audit-log.service.js';

export function setAuthCookies(res: Response, token: string): string {
  const csrfToken = crypto.randomBytes(32).toString('hex');
  const isProd = process.env.NODE_ENV === 'production';

  if (typeof res.cookie === 'function') {
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.cookie('csrf_token', csrfToken, {
      httpOnly: false, // Accessible by JavaScript client to submit in X-CSRF-Token header
      secure: isProd,
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
  }

  return csrfToken;
}

export function clearAuthCookies(res: Response): void {
  if (typeof res.clearCookie === 'function') {
    res.clearCookie('auth_token', { path: '/' });
    res.clearCookie('csrf_token', { path: '/' });
  }
}

export class AuthController {
  public router: Router;

  constructor() {
    this.router = Router();
    this.initRoutes();
  }

  private initRoutes(): void {
    this.router.post('/signup', this.signup.bind(this));
    this.router.post('/login', this.login.bind(this));
    this.router.post('/logout', this.logout.bind(this));
    this.router.get('/csrf', this.getCsrf.bind(this));
    this.router.get('/me', tenantAccessMiddleware, this.getMe.bind(this));
  }

  /**
   * POST /api/auth/signup
   * Registers a tenant with Argon2 password hashing and sets httpOnly + CSRF cookies
   */
  async signup(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;
      const result = await authService.signup({ email, password });
      const csrfToken = setAuthCookies(res, result.token);

      await AuditLogService.record({
        tenantId: result.tenant.id,
        action: 'AUTH_SIGNUP',
        actorIp: req.ip || 'unknown',
        userAgent: req.headers?.['user-agent'] as string,
        metadata: { email: result.tenant.email }
      });

      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        csrfToken,
        ...result
      });
    } catch (err: any) {
      const statusCode = err.statusCode || (err.message?.includes('valid') || err.message?.includes('characters') ? 400 : 500);
      res.status(statusCode).json({
        success: false,
        error: err.message || 'Signup failed'
      });
    }
  }

  /**
   * POST /api/auth/login
   * Authenticates tenant using Argon2, issues JWT and sets httpOnly + CSRF cookies
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;
      const result = await authService.login({ email, password });
      const csrfToken = setAuthCookies(res, result.token);

      await AuditLogService.record({
        tenantId: result.tenant.id,
        action: 'AUTH_LOGIN_SUCCESS',
        actorIp: req.ip || 'unknown',
        userAgent: req.headers?.['user-agent'] as string,
        metadata: { email: result.tenant.email }
      });

      res.status(200).json({
        success: true,
        message: 'Login successful',
        csrfToken,
        ...result
      });
    } catch (err: any) {
      const email = req.body?.email;
      if (email && typeof email === 'string' && typeof prisma.tenant?.findUnique === 'function') {
        try {
          const promise = prisma.tenant.findUnique({
            where: { email: email.trim().toLowerCase() },
            select: { id: true }
          });
          if (promise && typeof promise.then === 'function') {
            promise.then((tenant) => {
              if (tenant) {
                AuditLogService.record({
                  tenantId: tenant.id,
                  action: 'AUTH_LOGIN_FAILURE',
                  actorIp: req.ip || 'unknown',
                  userAgent: req.headers?.['user-agent'] as string,
                  metadata: { reason: err.message || 'Authentication failed' }
                });
              }
            }).catch(() => {});
          }
        } catch {}
      }

      const statusCode = err.statusCode || 401;
      res.status(statusCode).json({
        success: false,
        error: err.message || 'Authentication failed'
      });
    }
  }

  /**
   * GET /api/auth/me
   * Fetches session profile for currently authenticated tenant
   */
  async getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId }
      });

      if (!tenant) {
        res.status(404).json({ success: false, error: 'Tenant profile not found' });
        return;
      }

      res.status(200).json({
        success: true,
        tenant: {
          id: tenant.id,
          email: tenant.email,
          subscriptionStatus: tenant.subscriptionStatus,
          botToken: tenant.botToken,
          panelApiUrl: tenant.panelApiUrl,
          createdAt: tenant.createdAt,
          updatedAt: tenant.updatedAt
        }
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to fetch session profile'
      });
    }
  }

  /**
   * POST /api/auth/logout
   * Clears httpOnly auth_token and csrf_token cookies
   */
  async logout(req: Request, res: Response): Promise<void> {
    try {
      clearAuthCookies(res);
      res.status(200).json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message || 'Logout failed'
      });
    }
  }

  /**
   * GET /api/auth/csrf
   * Retrieves or sets double-submit CSRF cookie
   */
  getCsrf(req: Request, res: Response): void {
    let csrfToken = req.cookies?.csrf_token;
    if (!csrfToken) {
      csrfToken = crypto.randomBytes(32).toString('hex');
      const isProd = process.env.NODE_ENV === 'production';
      if (typeof res.cookie === 'function') {
        res.cookie('csrf_token', csrfToken, {
          httpOnly: false,
          secure: isProd,
          sameSite: 'strict',
          path: '/',
          maxAge: 7 * 24 * 60 * 60 * 1000
        });
      }
    }
    res.status(200).json({ csrfToken });
  }
}

export const authController = new AuthController();
