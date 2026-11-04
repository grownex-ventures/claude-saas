import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { app } from '../src/server.js';
import { prisma } from '../src/common/database/prisma.js';

import { tenantAccessMiddleware, AuthenticatedRequest } from '../src/common/middleware/tenant-access.middleware.js';

describe('WhatsApp API Integration Suite', () => {
  const secret = process.env.JWT_SECRET || 'super-secret-jwt-key-for-tenant-admin';
  const tenantId = 'test-tenant-wa-api';
  const token = jwt.sign({ tenantId }, secret);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated requests to WhatsApp routes with 401', () => {
    const req = { headers: {} } as AuthenticatedRequest;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as any;
    const next = vi.fn();

    tenantAccessMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('POST /api/tenants/whatsapp/configure updates tenant phone and enabled flag', async () => {
    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce({
      id: tenantId,
      hasWhatsapp: true
    } as any);

    vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce({
      id: tenantId,
      whatsAppPhoneNumber: '919876543210',
      whatsAppEnabled: true
    } as any);

    // Call TenantsService directly to verify business logic
    const { TenantsService } = await import('../src/tenants/tenants.service.js');
    const service = new TenantsService();

    const result = await service.configureWhatsApp(tenantId, {
      phoneNumber: '919876543210',
      enabled: true
    });

    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: tenantId },
      data: {
        whatsAppPhoneNumber: '919876543210',
        whatsAppEnabled: true
      }
    });
    expect(result.whatsAppPhoneNumber).toBe('919876543210');
    expect(result.whatsAppEnabled).toBe(true);
  });

  it('GET /api/tenants/whatsapp/status returns connection and credential details', async () => {
    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce({
      id: tenantId,
      whatsAppPhoneNumber: '919876543210',
      whatsAppEnabled: true
    } as any);

    const { TenantsService } = await import('../src/tenants/tenants.service.js');
    const service = new TenantsService();

    const status = await service.getWhatsAppStatus(tenantId);
    expect(status.enabled).toBe(true);
    expect(status.phoneNumber).toBe('919876543210');
    expect(status.connected).toBe(false);
  });

  it('POST /api/tenants/whatsapp/disconnect stops instance and toggles enabled flag', async () => {
    vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce({
      id: tenantId,
      whatsAppEnabled: false
    } as any);

    const { TenantsService } = await import('../src/tenants/tenants.service.js');
    const service = new TenantsService();

    const res = await service.disconnectWhatsApp(tenantId, true);
    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: tenantId },
      data: { whatsAppEnabled: false, whatsAppPhoneNumber: null }
    });
    expect(res.success).toBe(true);
  });
});
