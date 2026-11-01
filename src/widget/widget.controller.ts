import { Router, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { WidgetService, widgetService } from './widget.service.js';

export const widgetChatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: 'Too many chat requests. Please wait a moment before sending another message.',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  },
  keyGenerator: (req) => {
    const body = req.body || {};
    const tenantId = body.tenantId || '';
    const sessionId = body.sessionId || '';
    const ip = req.ip || 'unknown';
    return `${ip}:${tenantId}:${sessionId}`;
  },
  validate: false,
  skip: () => process.env.NODE_ENV === 'test'
});

export class WidgetController {
  public router: Router;

  constructor(private service: WidgetService = widgetService) {
    this.router = Router();
    this.initRoutes();
  }

  private initRoutes(): void {
    // Enable open CORS for all public widget endpoints
    this.router.use((_req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (_req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }
      next();
    });

    // GET /api/widget/config/:tenantId
    this.router.get('/config/:tenantId', async (req: Request, res: Response) => {
      try {
        const { tenantId } = req.params;
        if (!tenantId) {
          res.status(400).json({ error: 'tenantId is required' });
          return;
        }

        const config = await this.service.getTenantWidgetConfig(tenantId);
        res.status(200).json(config);
      } catch (err: any) {
        res.status(500).json({ error: err.message || 'Failed to fetch widget config' });
      }
    });

    // POST /api/widget/chat
    this.router.post('/chat', widgetChatLimiter, async (req: Request, res: Response) => {
      try {
        const { tenantId, sessionId, message } = req.body || {};

        if (!tenantId || typeof tenantId !== 'string') {
          res.status(400).json({ error: 'tenantId is required' });
          return;
        }
        if (!sessionId || typeof sessionId !== 'string' || sessionId.length < 8 || sessionId.length > 128) {
          res.status(400).json({ error: 'sessionId is required (8 to 128 characters)' });
          return;
        }
        if (!message || typeof message !== 'string' || !message.trim()) {
          res.status(400).json({ error: 'message cannot be empty' });
          return;
        }
        if (message.includes('\0') || tenantId.includes('\0') || sessionId.includes('\0')) {
          res.status(400).json({ error: 'Invalid input: Null bytes are not permitted' });
          return;
        }
        if (message.length > 4096) {
          res.status(400).json({ error: 'Message payload too large (maximum 4096 characters)' });
          return;
        }

        const result = await this.service.handleChatMessage(tenantId, sessionId, message);
        res.status(200).json(result);
      } catch (err: any) {
        res.status(400).json({ error: err.message || 'Error processing chat message' });
      }
    });

    // GET /api/widget/history/:tenantId/:sessionId
    this.router.get('/history/:tenantId/:sessionId', async (req: Request, res: Response) => {
      try {
        const { tenantId, sessionId } = req.params;

        if (!tenantId || !sessionId) {
          res.status(400).json({ error: 'tenantId and sessionId are required' });
          return;
        }

        const history = await this.service.getChatHistory(tenantId, sessionId);
        res.status(200).json(history);
      } catch (err: any) {
        res.status(500).json({ error: err.message || 'Failed to load chat history' });
      }
    });
  }
}

export const widgetController = new WidgetController();
