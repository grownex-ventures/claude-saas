/**
 * Billing Controller
 * Handles subscription pricing calculations, crypto invoice creation,
 * invoice status checks, and Cryptomus webhooks.
 */
import { Router, Request, Response } from 'express';
import {
  AuthenticatedRequest,
  tenantAccessMiddleware
} from '../common/middleware/tenant-access.middleware.js';
import { billingService } from './billing.service.js';
import { cryptomusService } from './cryptomus.service.js';

export class BillingController {
  public router: Router;

  constructor() {
    this.router = Router();
    this.initRoutes();
  }

  private initRoutes(): void {
    // -------------------------------------------------------------
    // Public Endpoints
    // -------------------------------------------------------------

    // POST /api/billing/calculate - Price calculator
    this.router.post('/calculate', (req: Request, res: Response): void => {
      try {
        const { channels, durationMonths } = req.body || {};
        if (!channels || !Array.isArray(channels)) {
          res.status(400).json({ error: 'channels array is required' });
          return;
        }

        const pricing = billingService.calculatePrice(channels, durationMonths);
        res.status(200).json({ success: true, pricing });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    });

    // POST /api/billing/webhook/cryptomus - Cryptomus Payment Callback
    this.router.post('/webhook/cryptomus', async (req: Request, res: Response): Promise<void> => {
      try {
        const signature = (req.headers['sign'] as string) || req.body?.sign;
        const result = await billingService.handleCryptomusWebhook(req.body, signature);
        res.status(200).json(result);
      } catch (err: any) {
        console.error('[BillingController] Webhook error:', err.message);
        res.status(400).json({ success: false, error: err.message });
      }
    });

    // -------------------------------------------------------------
    // Authenticated Tenant Endpoints
    // -------------------------------------------------------------
    const authRouter = Router();
    authRouter.use(tenantAccessMiddleware);

    // POST /api/billing/mock-pay/:orderId - Sandbox simulation (Restricted & Authenticated)
    authRouter.post('/mock-pay/:orderId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      try {
        const tenantId = req.tenantId!;
        const { orderId } = req.params;
        const result = await billingService.simulateMockPayment(tenantId, orderId);
        res.status(200).json(result);
      } catch (err: any) {
        const statusCode = err.statusCode || 400;
        res.status(statusCode).json({ success: false, error: err.message });
      }
    });

    // POST /api/billing/invoices - Create new invoice
    authRouter.post('/invoices', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      try {
        const tenantId = req.tenantId!;
        const { channels, durationMonths } = req.body || {};

        if (!channels || !Array.isArray(channels) || channels.length === 0) {
          res.status(400).json({ error: 'channels array is required (e.g. ["telegram", "whatsapp"])' });
          return;
        }

        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
        const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
        const baseUrl = `${protocol}://${host}`;

        const result = await billingService.createInvoice({
          tenantId,
          channels,
          durationMonths: durationMonths ? Number(durationMonths) : 1,
          baseUrl
        });

        res.status(201).json(result);
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    });

    // GET /api/billing/summary - Get tenant billing overview, usage, and invoices
    authRouter.get('/summary', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      try {
        const tenantId = req.tenantId!;
        const summary = await billingService.getBillingSummary(tenantId);
        res.status(200).json(summary);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // GET /api/billing/invoices - Get billing history
    authRouter.get('/invoices', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      try {
        const tenantId = req.tenantId!;
        const invoices = await billingService.getTenantInvoices(tenantId);
        res.status(200).json({ success: true, invoices });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // GET /api/billing/invoices/:orderId - Check specific invoice status
    authRouter.get('/invoices/:orderId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      try {
        const tenantId = req.tenantId!;
        const { orderId } = req.params;
        const status = await billingService.getInvoiceStatus(tenantId, orderId);
        res.status(200).json({ success: true, invoice: status });
      } catch (err: any) {
        res.status(404).json({ error: err.message });
      }
    });

    // Mount authenticated routes onto base router
    this.router.use('/', authRouter);
  }
}

export const billingController = new BillingController();

