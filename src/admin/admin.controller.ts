import { Request, Response, Router } from 'express';
import crypto from 'crypto';
import { rateLimit } from 'express-rate-limit';
import { adminService } from './admin.service.js';
import { adminAuthGuard } from './admin.guard.js';
import {
  setAuthCookies,
  setAdminAuthCookies,
  clearAdminAuthCookies
} from '../common/utils/auth-cookies.js';

export { setAdminAuthCookies, clearAdminAuthCookies };

export const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: 'Too many admin login attempts, please try again in 15 minutes',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  },
  skip: () => process.env.NODE_ENV === 'test'
});

export class AdminController {
  public router: Router;

  constructor() {
    this.router = Router();
    this.initRoutes();
  }

  private initRoutes(): void {
    // 1. Setup Status (Public - determines whether to show setup or login)
    this.router.get('/status', async (_req: Request, res: Response) => {
      try {
        const status = await adminService.getSetupStatus();
        res.json(status);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // 2. Initial Setup Wizard (Only works when no admin exists)
    this.router.post('/setup', async (req: Request, res: Response) => {
      try {
        const { email, password, name } = req.body || {};
        const result = await adminService.setupInitialAdmin({ email, password, name });

        // Set secure HTTP-only cookie and readable CSRF token cookie
        const csrfToken = setAdminAuthCookies(res, result.token);

        res.status(201).json({
          success: true,
          message: 'Super Admin successfully initialized',
          token: result.token,
          csrfToken,
          admin: result.admin
        });
      } catch (err: any) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    });

    // 3. Admin Login
    this.router.post('/login', adminLoginLimiter, async (req: Request, res: Response) => {
      try {
        const { email, password } = req.body || {};
        const result = await adminService.login({ email, password });

        const csrfToken = setAdminAuthCookies(res, result.token);

        res.json({
          success: true,
          message: 'Welcome back, Super Admin',
          token: result.token,
          csrfToken,
          admin: result.admin
        });
      } catch (err: any) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    });

    // 4. Admin Logout
    this.router.post('/logout', (_req: Request, res: Response) => {
      clearAdminAuthCookies(res);
      res.json({ success: true, message: 'Logged out successfully' });
    });

    // ==========================================
    // Guarded Super Admin Endpoints
    // ==========================================
    this.router.use(adminAuthGuard);

    // Current Admin Profile
    this.router.get('/me', (req: Request, res: Response) => {
      res.json({ admin: req.admin });
    });

    // Telemetry & Health Ops
    this.router.get('/telemetry', async (_req: Request, res: Response) => {
      try {
        const telemetry = await adminService.getTelemetry();
        res.json(telemetry);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Tenant Management: List
    this.router.get('/tenants', async (req: Request, res: Response) => {
      try {
        const result = await adminService.getTenants({
          search: req.query.search as string,
          status: req.query.status as string,
          page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
          limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20
        });
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Tenant Management: Subscription Status
    this.router.patch('/tenants/:id/subscription', async (req: Request, res: Response) => {
      try {
        const { status } = req.body || {};
        if (!['ACTIVE', 'INACTIVE', 'EXPIRED'].includes(status)) {
          res.status(400).json({ error: 'Valid status required: ACTIVE, INACTIVE, or EXPIRED' });
          return;
        }
        const updated = await adminService.updateTenantSubscription(req.params.id, status);
        res.json({ success: true, tenant: updated });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Tenant Management: Channel Plan Entitlements (Telegram, WhatsApp, Widget)
    this.router.patch('/tenants/:id/plans', async (req: Request, res: Response) => {
      try {
        const { hasTelegram, hasWhatsapp, hasWidget } = req.body || {};
        const updated = await adminService.updateTenantPlans(req.params.id, {
          hasTelegram,
          hasWhatsapp,
          hasWidget
        });
        res.json({ success: true, tenant: updated });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Tenant Management: Email Verification Toggle
    this.router.patch('/tenants/:id/verify-email', async (req: Request, res: Response) => {
      try {
        const { verified } = req.body || {};
        const updated = await adminService.toggleTenantEmailVerified(req.params.id, Boolean(verified));
        res.json({ success: true, tenant: updated });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Tenant Management: 1-Click Impersonation
    this.router.post('/tenants/:id/impersonate', async (req: Request, res: Response) => {
      try {
        const result = await adminService.impersonateTenant(req.params.id);

        // Issue auth_token and csrf_token cookies via standard setAuthCookies helper
        const csrfToken = setAuthCookies(res, result.token);

        res.json({
          success: true,
          message: `Impersonation session created for ${result.tenant.email}`,
          token: result.token,
          csrfToken,
          redirectUrl: '/dashboard'
        });
      } catch (err: any) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    });

    // Tenant Management: Delete Tenant
    this.router.delete('/tenants/:id', async (req: Request, res: Response) => {
      try {
        await adminService.deleteTenant(req.params.id);
        res.json({ success: true, message: 'Tenant successfully deleted' });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Leads: List
    this.router.get('/leads', async (req: Request, res: Response) => {
      try {
        const result = await adminService.getLeads({
          status: req.query.status as string,
          search: req.query.search as string,
          page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
          limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20
        });
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Leads: Update status and notes
    this.router.patch('/leads/:id', async (req: Request, res: Response) => {
      try {
        const { status, notes } = req.body || {};
        const updated = await adminService.updateLead(req.params.id, { status, notes });
        res.json({ success: true, lead: updated });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Leads: Delete lead
    this.router.delete('/leads/:id', async (req: Request, res: Response) => {
      try {
        await adminService.deleteLead(req.params.id);
        res.json({ success: true, message: 'Lead deleted' });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // System Settings: Read masked
    this.router.get('/settings', async (_req: Request, res: Response) => {
      try {
        const settings = await adminService.getSettings();
        res.json({ settings });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // System Settings: Batch update
    this.router.post('/settings', async (req: Request, res: Response) => {
      try {
        const updates = req.body || {};
        const result = await adminService.updateSettings(updates);
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Test AI Connection
    this.router.post('/test-ai', async (req: Request, res: Response) => {
      try {
        const result = await adminService.testAiConnection(req.body);
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Test Email Connection
    this.router.post('/test-email', async (req: Request, res: Response) => {
      try {
        const { to } = req.body || {};
        const result = await adminService.testEmailConnection(to);
        res.json(result);
      } catch (err: any) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    });

    // Invoices Oversight: List platform crypto invoices
    this.router.get('/invoices', async (_req: Request, res: Response) => {
      try {
        const invoices = await adminService.getInvoices();
        res.json({ success: true, invoices });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // Invoices Oversight: Manually mark an invoice as paid
    this.router.post('/invoices/:orderId/mark-paid', async (req: Request, res: Response) => {
      try {
        const result = await adminService.markInvoicePaid(req.params.orderId, (req as any).adminId);
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });
  }
}

export const adminController = new AdminController();

