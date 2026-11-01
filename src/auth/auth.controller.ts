import { Router, Request, Response } from 'express';
import { authService } from './auth.service.js';
import { tenantAccessMiddleware, AuthenticatedRequest } from '../common/middleware/tenant-access.middleware.js';
import { prisma } from '../common/database/prisma.js';

export class AuthController {
  public router: Router;

  constructor() {
    this.router = Router();
    this.initRoutes();
  }

  private initRoutes(): void {
    this.router.post('/signup', this.signup.bind(this));
    this.router.post('/login', this.login.bind(this));
    this.router.get('/me', tenantAccessMiddleware, this.getMe.bind(this));
  }

  /**
   * POST /api/auth/signup
   * Registers a tenant with Argon2 password hashing
   */
  async signup(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;
      const result = await authService.signup({ email, password });
      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        ...result
      });
    } catch (err: any) {
      const statusCode = err.statusCode || (err.message.includes('valid') || err.message.includes('characters') ? 400 : 500);
      res.status(statusCode).json({
        success: false,
        error: err.message || 'Signup failed'
      });
    }
  }

  /**
   * POST /api/auth/login
   * Authenticates tenant using Argon2 and issues JWT
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;
      const result = await authService.login({ email, password });
      res.status(200).json({
        success: true,
        message: 'Login successful',
        ...result
      });
    } catch (err: any) {
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
}

export const authController = new AuthController();
