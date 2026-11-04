import { Request, Response, Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { prisma } from '../common/database/prisma.js';
import { RuntimeLogService } from '../common/logging/runtime-log.service.js';

export const leadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // max 10 submissions per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: 'Too many lead submissions from this IP. Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  },
  skip: () => process.env.NODE_ENV === 'test'
});

export class LeadsController {
  public router: Router;

  constructor() {
    this.router = Router();
    this.initRoutes();
  }

  private initRoutes(): void {
    // Open CORS for public leads endpoint
    this.router.use((_req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (_req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }
      next();
    });

    this.router.post('/', leadLimiter, async (req: Request, res: Response) => {
      try {
        const { email, panelUrl, contactNumber, message } = req.body || {};

        // 1. Validation
        if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
          res.status(400).json({ error: 'A valid email address is required.' });
          return;
        }

        if (!panelUrl || typeof panelUrl !== 'string' || !/^https?:\/\/.+/i.test(panelUrl.trim())) {
          res.status(400).json({ error: 'A valid SMM panel URL starting with http:// or https:// is required.' });
          return;
        }

        if (!contactNumber || typeof contactNumber !== 'string' || contactNumber.trim().length < 3) {
          res.status(400).json({ error: 'A contact number or handle is required (at least 3 characters).' });
          return;
        }

        const sanitizedEmail = email.trim().toLowerCase().slice(0, 255);
        const sanitizedPanelUrl = panelUrl.trim().slice(0, 500);
        const sanitizedContact = contactNumber.trim().slice(0, 100);
        const sanitizedMessage = typeof message === 'string' ? message.trim().slice(0, 2000) : null;

        // 2. Persist in database
        const lead = await prisma.leadRequest.create({
          data: {
            email: sanitizedEmail,
            panelUrl: sanitizedPanelUrl,
            contactNumber: sanitizedContact,
            message: sanitizedMessage,
            ipAddress: req.ip || 'unknown',
            userAgent: req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 255) : null
          }
        });

        // 3. Telemetry log
        RuntimeLogService.record({
          tenantId: 'platform',
          channel: 'system',
          level: 'info',
          event: 'LEAD_SUBMISSION',
          message: `New setup request received from ${sanitizedEmail} for ${sanitizedPanelUrl}`,
          details: {
            leadId: lead.id,
            contact: sanitizedContact
          }
        }).catch(() => {});

        res.status(201).json({
          success: true,
          leadId: lead.id,
          message: 'Thank you! Your setup request has been recorded. Our team will reach out shortly.'
        });
      } catch (err: any) {
        console.error('[LeadsController] Failed to record lead:', err);
        res.status(500).json({ error: 'Failed to record request. Please try again.' });
      }
    });
  }
}

export const leadsController = new LeadsController();

