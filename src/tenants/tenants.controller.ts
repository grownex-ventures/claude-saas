import { Router, Response } from 'express';
import {
  AuthenticatedRequest,
  tenantAccessMiddleware
} from '../common/middleware/tenant-access.middleware.js';
import { TenantsService } from './tenants.service.js';

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
  }
}

export const tenantsController = new TenantsController();
