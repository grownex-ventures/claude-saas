import { Router, Response } from 'express';
import {
  AuthenticatedRequest,
  tenantAccessMiddleware
} from '../common/middleware/tenant-access.middleware.js';
import { TenantsService } from './tenants.service.js';
import { RuntimeLogService } from '../common/logging/runtime-log.service.js';

export class TenantsController {
  public router: Router;

  constructor(private tenantsService: TenantsService = new TenantsService()) {
    this.router = Router();
    this.initRoutes();
  }

  private initRoutes(): void {
    // Apply tenant access middleware to all endpoints
    this.router.use(tenantAccessMiddleware);

    // POST /api/tenants/configure
    this.router.post('/configure', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const { botToken, panelApiUrl } = req.body || {};

        if (!botToken || !panelApiUrl) {
          res.status(400).json({ error: 'botToken and panelApiUrl are required' });
          return;
        }

        const tenant = await this.tenantsService.configure(tenantId, {
          botToken,
          panelApiUrl
        });

        res.status(200).json({
          message: 'Tenant configured successfully',
          tenantId: tenant.id,
          panelApiUrl: tenant.panelApiUrl,
          botTokenConfigured: Boolean(tenant.botToken),
          botUsername: (tenant as any).botUsername || null
        });
      } catch (error: any) {
        res.status(400).json({ error: error.message || 'Configuration failed' });
      }
    });

    // POST /api/tenants/activate
    this.router.post('/activate', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const result = await this.tenantsService.activate(tenantId);
        res.status(200).json(result);
      } catch (error: any) {
        res.status(400).json({ error: error.message || 'Activation failed' });
      }
    });

    // POST /api/tenants/deactivate
    this.router.post('/deactivate', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const result = await this.tenantsService.deactivate(tenantId);
        res.status(200).json(result);
      } catch (error: any) {
        res.status(400).json({ error: error.message || 'Deactivation failed' });
      }
    });

    // GET /api/tenants/telegram/test
    this.router.get('/telegram/test', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const result = await this.tenantsService.testTelegramBot(tenantId);
        res.status(200).json(result);
      } catch (error: any) {
        res.status(400).json({ error: error.message || 'Telegram test failed' });
      }
    });

    // POST /api/tenants/whatsapp/configure
    this.router.post('/whatsapp/configure', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const { phoneNumber, enabled, panelApiUrl } = req.body || {};
        const result = await this.tenantsService.configureWhatsApp(tenantId, {
          phoneNumber: phoneNumber || null,
          enabled: typeof enabled === 'boolean' ? enabled : true,
          panelApiUrl
        });
        res.status(200).json({
          message: 'WhatsApp settings configured successfully',
          ...result
        });
      } catch (error: any) {
        res.status(400).json({ error: error.message || 'WhatsApp configuration failed' });
      }
    });

    // POST /api/tenants/whatsapp/start
    this.router.post('/whatsapp/start', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const { mode, phoneNumber, forceRestart, panelApiUrl } = req.body || {};
        const result = await this.tenantsService.startWhatsApp(tenantId, {
          mode: mode || 'qr',
          phoneNumber,
          forceRestart: Boolean(forceRestart),
          panelApiUrl
        });
        res.status(200).json({
          message: 'WhatsApp initialization triggered',
          ...result
        });
      } catch (error: any) {
        res.status(400).json({ error: error.message || 'WhatsApp startup failed' });
      }
    });

    // POST /api/tenants/whatsapp/pairing-code
    this.router.post('/whatsapp/pairing-code', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const { phoneNumber, panelApiUrl } = req.body || {};
        if (!phoneNumber) {
          res.status(400).json({ error: 'phoneNumber is required' });
          return;
        }
        const result = await this.tenantsService.requestPairingCode(tenantId, phoneNumber, panelApiUrl);
        res.status(200).json(result);
      } catch (error: any) {
        res.status(400).json({ error: error.message || 'Pairing code generation failed' });
      }
    });

    // GET /api/tenants/whatsapp/status
    this.router.get('/whatsapp/status', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const status = await this.tenantsService.getWhatsAppStatus(tenantId);
        res.status(200).json(status);
      } catch (error: any) {
        res.status(400).json({ error: error.message || 'Failed to fetch WhatsApp status' });
      }
    });

    // GET /api/tenants/whatsapp/qr-stream (Server-Sent Events)
    this.router.get('/whatsapp/qr-stream', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();

        const manager = this.tenantsService.getWhatsAppManager();
        let service = manager.getService(tenantId);

        if (!service) {
          service = await this.tenantsService.startWhatsApp(tenantId, { mode: 'qr' }).then(() => manager.getService(tenantId));
        }

        if (!service) {
          res.write(`data: ${JSON.stringify({ type: 'error', message: 'Could not initialize service' })}\n\n`);
          res.end();
          return;
        }

        if (service.isConnected()) {
          res.write(`data: ${JSON.stringify({ type: 'status', status: 'open', message: 'WhatsApp is connected' })}\n\n`);
        } else if (service.lastQR) {
          res.write(`data: ${JSON.stringify({ type: 'qr', qr: service.lastQR, qrDataUrl: service.lastQRDataUrl })}\n\n`);
        } else if (service.pairingCode) {
          res.write(`data: ${JSON.stringify({ type: 'pairingCode', pairingCode: service.pairingCode })}\n\n`);
        }

        const onQR = (payload: any) => {
          res.write(`data: ${JSON.stringify({ type: 'qr', qr: payload.qr, qrDataUrl: payload.qrDataUrl || service?.lastQRDataUrl })}\n\n`);
        };

        const onConn = (update: any) => {
          res.write(`data: ${JSON.stringify({ type: 'status', ...update, qrDataUrl: update.qrDataUrl || service?.lastQRDataUrl })}\n\n`);
          if (update.qr) {
            res.write(`data: ${JSON.stringify({ type: 'qr', qr: update.qr, qrDataUrl: update.qrDataUrl || service?.lastQRDataUrl })}\n\n`);
          }
          if (update.pairingCode) {
            res.write(`data: ${JSON.stringify({ type: 'pairingCode', pairingCode: update.pairingCode })}\n\n`);
          }
        };

        service.events.on('qr', onQR);
        service.events.on('connection.update', onConn);

        req.on('close', () => {
          if (service) {
            service.events.off('qr', onQR);
            service.events.off('connection.update', onConn);
          }
        });
      } catch (err: any) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
        res.end();
      }
    });

    // POST /api/tenants/whatsapp/disconnect
    this.router.post('/whatsapp/disconnect', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const { clearCredentials } = req.body || {};
        const result = await this.tenantsService.disconnectWhatsApp(tenantId, Boolean(clearCredentials));
        res.status(200).json(result);
      } catch (error: any) {
        res.status(400).json({ error: error.message || 'Failed to disconnect WhatsApp' });
      }
    });

    // POST /api/tenants/whatsapp/test
    this.router.post('/whatsapp/test', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const result = await this.tenantsService.testWhatsApp(tenantId);
        res.status(200).json(result);
      } catch (error: any) {
        res.status(400).json({ error: error.message || 'WhatsApp test failed' });
      }
    });

    // POST /api/tenants/widget/configure
    this.router.post('/widget/configure', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const { widgetApiKey, widgetTitle, widgetWelcomeMessage, widgetAccentColor, widgetEnabled, panelApiUrl } = req.body || {};
        const result = await this.tenantsService.configureWidget(tenantId, {
          panelApiUrl,
          widgetApiKey,
          widgetTitle,
          widgetWelcomeMessage,
          widgetAccentColor,
          widgetEnabled
        });
        res.status(200).json({
          message: 'Website widget settings saved successfully',
          ...result
        });
      } catch (error: any) {
        res.status(400).json({ error: error.message || 'Failed to configure widget' });
      }
    });

    // GET /api/tenants/widget/settings
    this.router.get('/widget/settings', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const settings = await this.tenantsService.getWidgetSettings(tenantId);
        res.status(200).json(settings);
      } catch (error: any) {
        res.status(400).json({ error: error.message || 'Failed to fetch widget settings' });
      }
    });

    // DELETE /api/tenants/me (COMP-02)
    // Authenticated account deletion with password re-confirmation
    this.router.delete('/me', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const { password } = req.body || {};

        if (!password) {
          res.status(400).json({ error: 'Password re-confirmation is required' });
          return;
        }

        const result = await this.tenantsService.deleteAccount(tenantId, password, {
          ip: req.ip,
          userAgent: req.headers['user-agent'] as string
        });

        res.status(200).json(result);
      } catch (error: any) {
        const statusCode = error.statusCode || 400;
        res.status(statusCode).json({ error: error.message || 'Failed to delete account' });
      }
    });

    // GET /api/tenants/conversations
    this.router.get('/conversations', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const { channel, search, limit } = (req.query || {}) as Record<string, string>;
        const conversations = await this.tenantsService.getConversations(tenantId, {
          channel,
          search,
          limit: limit ? parseInt(limit, 10) : 50
        });
        res.status(200).json({ success: true, conversations });
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to fetch conversations' });
      }
    });

    // GET /api/tenants/overview-stats
    this.router.get('/overview-stats', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const range = req.query.range ? parseInt(req.query.range as string, 10) : 7;
        const stats = await this.tenantsService.getOverviewStats(tenantId, range);
        res.status(200).json({ success: true, ...stats });
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to fetch overview stats' });
      }
    });

    // GET /api/tenants/logs
    this.router.get('/logs', (req: AuthenticatedRequest, res: Response) => this.getLogs(req, res));

    // DELETE /api/tenants/logs
    this.router.delete('/logs', (req: AuthenticatedRequest, res: Response) => this.clearLogs(req, res));
  }

  public async getLogs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const { channel, level, search, limit } = (req.query || {}) as Record<string, string>;
      const result = await RuntimeLogService.getLogs(tenantId, {
        channel,
        level,
        search,
        limit: limit ? parseInt(limit, 10) : 50
      });
      res.status(200).json({
        success: true,
        ...result
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch runtime logs' });
    }
  }

  public async clearLogs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      await RuntimeLogService.clearLogs(tenantId);
      res.status(200).json({ success: true, message: 'Runtime logs cleared' });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to clear runtime logs' });
    }
  }
}


export const tenantsController = new TenantsController();
