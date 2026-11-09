import { Router, Response } from 'express';
import {
  AuthenticatedRequest,
  tenantAccessMiddleware
} from '../common/middleware/tenant-access.middleware.js';
import { TenantsService } from './tenants.service.js';
import { ticketsService } from '../tickets/tickets.service.js';
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

    // GET /api/tenants/conversations/:id
    this.router.get('/conversations/:id', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const conversationId = req.params.id;
        const conversation = await this.tenantsService.getConversation(tenantId, conversationId);
        if (!conversation) {
          res.status(404).json({ error: 'Conversation not found' });
          return;
        }
        res.status(200).json(conversation);
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to fetch conversation' });
      }
    });

    // POST /api/tenants/conversations/:id/reply
    this.router.post('/conversations/:id/reply', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const conversationId = req.params.id;
        const { text } = req.body || {};
        if (!text || !text.trim()) {
          res.status(400).json({ error: 'Message text cannot be empty' });
          return;
        }
        const result = await this.tenantsService.sendConversationReply(tenantId, conversationId, text.trim());
        res.status(200).json(result);
      } catch (error: any) {
        const status = error.message?.includes('not found') ? 404 : 400;
        res.status(status).json({ error: error.message || 'Failed to send reply' });
      }
    });

    // POST /api/tenants/conversations/:id/takeover
    this.router.post('/conversations/:id/takeover', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const conversationId = req.params.id;
        const result = await this.tenantsService.takeOverConversation(tenantId, conversationId);
        res.status(200).json(result);
      } catch (error: any) {
        const status = error.message?.includes('not found') ? 404 : 400;
        res.status(status).json({ error: error.message || 'Failed to take over conversation' });
      }
    });

    // POST /api/tenants/conversations/:id/handback
    this.router.post('/conversations/:id/handback', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const conversationId = req.params.id;
        const result = await this.tenantsService.handBackConversation(tenantId, conversationId);
        res.status(200).json(result);
      } catch (error: any) {
        const status = error.message?.includes('not found') ? 404 : 400;
        res.status(status).json({ error: error.message || 'Failed to hand back conversation' });
      }
    });

    // GET /api/tenants/panel
    this.router.get('/panel', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const status = await this.tenantsService.getPanelStatus(tenantId);
        res.status(200).json(status);
      } catch (error: any) {
        res.status(400).json({ error: error.message || 'Failed to fetch panel status' });
      }
    });

    // POST /api/tenants/panel/test
    this.router.post('/panel/test', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const { url, apiKey } = req.body || {};
        if (!url) {
          res.status(400).json({ error: 'Panel API URL is required' });
          return;
        }
        const result = await this.tenantsService.testPanel(tenantId, url, apiKey);
        res.status(200).json(result);
      } catch (error: any) {
        res.status(400).json({ error: error.message || 'Panel connection test failed' });
      }
    });

    // POST /api/tenants/panel/connect
    this.router.post('/panel/connect', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const { url, apiKey } = req.body || {};
        if (!url) {
          res.status(400).json({ error: 'Panel API URL is required' });
          return;
        }
        const result = await this.tenantsService.connectPanel(tenantId, url, apiKey);
        res.status(200).json(result);
      } catch (error: any) {
        res.status(400).json({ error: error.message || 'Panel connection failed' });
      }
    });

    // POST /api/tenants/panel/sync
    this.router.post('/panel/sync', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const result = await this.tenantsService.syncPanelCatalog(tenantId);
        res.status(200).json(result);
      } catch (error: any) {
        res.status(400).json({ error: error.message || 'Panel sync failed' });
      }
    });

    // POST /api/tenants/panel/disconnect
    this.router.post('/panel/disconnect', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const result = await this.tenantsService.disconnectPanel(tenantId);
        res.status(200).json(result);
      } catch (error: any) {
        res.status(400).json({ error: error.message || 'Failed to disconnect panel' });
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

    // Support Tickets Endpoints
    // GET /api/v1/tenants/tickets
    this.router.get('/tickets', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const { status, search } = (req.query || {}) as { status?: string; search?: string };
        const tickets = await ticketsService.getTenantTickets(tenantId, { status, search });
        res.status(200).json(tickets);
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to fetch tickets' });
      }
    });

    // GET /api/v1/tenants/tickets/unread-count
    this.router.get('/tickets/unread-count', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const result = await ticketsService.getTenantUnreadCount(tenantId);
        res.status(200).json(result);
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to fetch unread ticket count' });
      }
    });

    // GET /api/v1/tenants/tickets/:id
    this.router.get('/tickets/:id', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const ticket = await ticketsService.getTenantTicket(tenantId, req.params.id);
        res.status(200).json(ticket);
      } catch (error: any) {
        res.status(404).json({ error: error.message || 'Ticket not found' });
      }
    });

    // POST /api/v1/tenants/tickets
    this.router.post('/tickets', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const ticket = await ticketsService.createTenantTicket(tenantId, req.body || {});
        res.status(201).json(ticket);
      } catch (error: any) {
        res.status(400).json({ error: error.message || 'Failed to create ticket' });
      }
    });

    // POST /api/v1/tenants/tickets/:id/reply
    this.router.post('/tickets/:id/reply', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const { message } = req.body || {};
        const ticket = await ticketsService.replyTenantTicket(tenantId, req.params.id, message);
        res.status(200).json(ticket);
      } catch (error: any) {
        res.status(400).json({ error: error.message || 'Failed to send reply' });
      }
    });

    // POST /api/v1/tenants/tickets/:id/close
    this.router.post('/tickets/:id/close', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const result = await ticketsService.closeTenantTicket(tenantId, req.params.id);
        res.status(200).json(result);
      } catch (error: any) {
        res.status(400).json({ error: error.message || 'Failed to close ticket' });
      }
    });

    // POST /api/v1/tenants/tickets/:id/reopen
    this.router.post('/tickets/:id/reopen', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const result = await ticketsService.reopenTenantTicket(tenantId, req.params.id);
        res.status(200).json(result);
      } catch (error: any) {
        res.status(400).json({ error: error.message || 'Failed to reopen ticket' });
      }
    });

    // ==========================================
    // Real Tenant Settings & Profile Endpoints
    // ==========================================
    // GET /api/v1/tenants/settings
    this.router.get('/settings', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const settings = await this.tenantsService.getSettings(tenantId);
        res.status(200).json(settings);
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to fetch settings' });
      }
    });

    // PATCH /api/v1/tenants/settings/profile
    this.router.patch('/settings/profile', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const { name } = req.body || {};
        const result = await this.tenantsService.updateProfile(tenantId, name);
        res.status(200).json(result);
      } catch (error: any) {
        res.status(400).json({ error: error.message || 'Failed to update profile' });
      }
    });

    // PATCH /api/v1/tenants/settings/notifications
    this.router.patch('/settings/notifications', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const result = await this.tenantsService.updateNotifications(tenantId, req.body || {});
        res.status(200).json(result);
      } catch (error: any) {
        res.status(400).json({ error: error.message || 'Failed to update notifications' });
      }
    });

    // PATCH /api/v1/tenants/settings/2fa
    this.router.patch('/settings/2fa', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const { enabled } = req.body || {};
        const result = await this.tenantsService.updateTwoFactor(tenantId, enabled);
        res.status(200).json(result);
      } catch (error: any) {
        res.status(400).json({ error: error.message || 'Failed to update two-factor setting' });
      }
    });

    // POST /api/v1/tenants/settings/api-key/regenerate
    this.router.post('/settings/api-key/regenerate', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const result = await this.tenantsService.regenerateApiKey(tenantId);
        res.status(200).json(result);
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to regenerate API key' });
      }
    });

    // GET /api/v1/tenants/ai
    this.router.get('/ai', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const settings = await this.tenantsService.getAiSettings(tenantId);
        res.status(200).json(settings);
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to fetch AI settings' });
      }
    });

    // PATCH /api/v1/tenants/ai
    this.router.patch('/ai', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const updated = await this.tenantsService.updateAiSettings(tenantId, req.body || {});
        res.status(200).json(updated);
      } catch (error: any) {
        res.status(400).json({ error: error.message || 'Failed to save AI settings' });
      }
    });

    // POST /api/v1/tenants/ai/faqs
    this.router.post('/ai/faqs', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const { question, answer } = req.body || {};
        const faq = await this.tenantsService.addFaq(tenantId, { question, answer });
        res.status(201).json(faq);
      } catch (error: any) {
        res.status(400).json({ error: error.message || 'Failed to add FAQ' });
      }
    });

    // PUT /api/v1/tenants/ai/faqs/:id
    this.router.put('/ai/faqs/:id', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const faqId = req.params.id;
        const { question, answer } = req.body || {};
        const faq = await this.tenantsService.updateFaq(tenantId, faqId, { question, answer });
        res.status(200).json(faq);
      } catch (error: any) {
        res.status(400).json({ error: error.message || 'Failed to update FAQ' });
      }
    });

    // DELETE /api/v1/tenants/ai/faqs/:id
    this.router.delete('/ai/faqs/:id', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const faqId = req.params.id;
        const result = await this.tenantsService.deleteFaq(tenantId, faqId);
        res.status(200).json(result);
      } catch (error: any) {
        res.status(400).json({ error: error.message || 'Failed to delete FAQ' });
      }
    });

    // POST /api/v1/tenants/ai/test
    this.router.post('/ai/test', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const { message, settings } = req.body || {};
        const result = await this.tenantsService.testAiAgent(tenantId, { message, settings });
        res.status(200).json(result);
      } catch (error: any) {
        res.status(400).json({ error: error.message || 'AI test failed' });
      }
    });
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
