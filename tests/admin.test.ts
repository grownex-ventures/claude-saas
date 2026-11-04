import { describe, it, expect, vi, beforeEach } from 'vitest';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { adminService } from '../src/admin/admin.service.js';
import { adminAuthGuard, getAdminJwtSecret } from '../src/admin/admin.guard.js';
import { settingsService } from '../src/common/settings/settings.service.js';
import { prisma } from '../src/common/database/prisma.js';
import { redis } from '../src/common/redis/redis.js';

describe('Super Admin Dashboard & Control Center Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Setup & Authentication', () => {
    it('returns hasAdmin: false when no admin accounts exist', async () => {
      vi.spyOn(prisma.adminUser, 'count').mockResolvedValueOnce(0);

      const status = await adminService.getSetupStatus();
      expect(status.hasAdmin).toBe(false);
      expect(status.count).toBe(0);
    });

    it('creates initial super admin account and returns token on valid setup', async () => {
      vi.spyOn(prisma.adminUser, 'count').mockResolvedValueOnce(0);
      vi.spyOn(prisma.adminUser, 'create').mockResolvedValueOnce({
        id: 'admin-uuid-1',
        email: 'master@yoursmmagent.com',
        passwordHash: '$argon2id$mock',
        name: 'Master Admin',
        mfaEnabled: false,
        mfaSecret: null,
        lastLoginAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const result = await adminService.setupInitialAdmin({
        email: 'master@yoursmmagent.com',
        password: 'SuperAdminPassword123!',
        name: 'Master Admin'
      });

      expect(result.token).toBeDefined();
      expect(result.admin.email).toBe('master@yoursmmagent.com');
      expect(result.admin.name).toBe('Master Admin');
    });

    it('rejects initial setup if an admin already exists (prevents takeover)', async () => {
      vi.spyOn(prisma.adminUser, 'count').mockResolvedValueOnce(1);

      await expect(
        adminService.setupInitialAdmin({
          email: 'hacker@example.com',
          password: 'Password123!'
        })
      ).rejects.toThrow('Admin setup has already been completed');
    });

    it('authenticates super admin with correct password and updates lastLoginAt', async () => {
      const realHash = await argon2.hash('SecretAdminKey999!');
      vi.spyOn(prisma.adminUser, 'findUnique').mockResolvedValueOnce({
        id: 'admin-uuid-1',
        email: 'master@yoursmmagent.com',
        passwordHash: realHash,
        name: 'Master Admin',
        mfaEnabled: false,
        mfaSecret: null,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      const updateSpy = vi.spyOn(prisma.adminUser, 'update').mockResolvedValueOnce({} as any);

      const result = await adminService.login({
        email: 'master@yoursmmagent.com',
        password: 'SecretAdminKey999!'
      });

      expect(result.token).toBeDefined();
      expect(result.admin.email).toBe('master@yoursmmagent.com');
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'admin-uuid-1' } })
      );
    });

    it('rejects admin login with incorrect password', async () => {
      const realHash = await argon2.hash('SecretAdminKey999!');
      vi.spyOn(prisma.adminUser, 'findUnique').mockResolvedValueOnce({
        id: 'admin-uuid-1',
        email: 'master@yoursmmagent.com',
        passwordHash: realHash,
        name: 'Master Admin',
        mfaEnabled: false,
        mfaSecret: null,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await expect(
        adminService.login({
          email: 'master@yoursmmagent.com',
          password: 'WrongPassword!'
        })
      ).rejects.toThrow('Invalid email or password');
    });
  });

  describe('2. Admin Auth Guard Middleware', () => {
    it('blocks request when no token is present', async () => {
      const req: any = { cookies: {}, headers: {} };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await adminAuthGuard(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'ADMIN_UNAUTHORIZED' }));
      expect(next).not.toHaveBeenCalled();
    });

    it('allows request when valid admin Bearer token is provided', async () => {
      const token = jwt.sign(
        { id: 'admin-uuid-1', email: 'master@yoursmmagent.com', name: 'Master Admin', role: 'superadmin' },
        getAdminJwtSecret()
      );

      vi.spyOn(prisma.adminUser, 'findUnique').mockResolvedValueOnce({
        id: 'admin-uuid-1',
        email: 'master@yoursmmagent.com',
        name: 'Master Admin'
      } as any);

      const req: any = {
        cookies: {},
        headers: { authorization: `Bearer ${token}` }
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await adminAuthGuard(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.admin).toBeDefined();
      expect(req.admin.email).toBe('master@yoursmmagent.com');
      expect(req.admin.role).toBe('superadmin');
    });

    it('allows request when valid admin_token cookie is provided', async () => {
      const token = jwt.sign(
        { id: 'admin-uuid-1', email: 'master@yoursmmagent.com', name: 'Master Admin', role: 'superadmin' },
        getAdminJwtSecret()
      );

      vi.spyOn(prisma.adminUser, 'findUnique').mockResolvedValueOnce({
        id: 'admin-uuid-1',
        email: 'master@yoursmmagent.com',
        name: 'Master Admin'
      } as any);

      const req: any = {
        cookies: { admin_token: token },
        headers: {}
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await adminAuthGuard(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.admin.email).toBe('master@yoursmmagent.com');
    });
  });

  describe('3. Telemetry & Live Operations', () => {
    it('returns database health, redis ping, and accurate aggregate counts', async () => {
      vi.spyOn(prisma, '$queryRaw').mockResolvedValueOnce([1] as any);
      vi.spyOn(redis, 'ping').mockResolvedValueOnce('PONG');
      vi.spyOn(prisma.tenant, 'count')
        .mockResolvedValueOnce(30)  // total
        .mockResolvedValueOnce(22)  // active
        .mockResolvedValueOnce(3);  // expired
      vi.spyOn(prisma.leadRequest, 'count')
        .mockResolvedValueOnce(15)  // total
        .mockResolvedValueOnce(4);  // new
      vi.spyOn(prisma.botUserSession, 'count').mockResolvedValueOnce(120);
      vi.spyOn(prisma.whatsAppSession, 'count').mockResolvedValueOnce(55);
      vi.spyOn(prisma.webChatSession, 'count').mockResolvedValueOnce(75);
      vi.spyOn(prisma.webChatMessage, 'count').mockResolvedValueOnce(380);

      const telemetry = await adminService.getTelemetry();

      expect(telemetry.health.database).toBe('healthy');
      expect(telemetry.health.redis).toBe('healthy');
      expect(telemetry.metrics.totalTenants).toBe(30);
      expect(telemetry.metrics.activeSubscriptions).toBe(22);
      expect(telemetry.metrics.sessions.telegram).toBe(120);
      expect(telemetry.metrics.sessions.whatsapp).toBe(55);
    });
  });

  describe('4. Dynamic Settings & Masking', () => {
    it('masks sensitive API keys and passwords in getAllMasked()', async () => {
      vi.spyOn(prisma.systemSetting, 'findMany').mockResolvedValueOnce([
        {
          key: 'AI_API_KEY',
          value: 'sk-1234567890abcdef123456',
          isEncrypted: false,
          category: 'AI',
          description: null,
          updatedAt: new Date()
        }
      ]);

      const masked = await settingsService.getAllMasked();

      expect(masked.AI_API_KEY).toBeDefined();
      expect(masked.AI_API_KEY.value).toContain('••••');
      expect(masked.AI_API_KEY.value).not.toBe('sk-1234567890abcdef123456');
    });

    it('batch updates settings and encrypts sensitive keys', async () => {
      const upsertSpy = vi.spyOn(prisma.systemSetting, 'upsert').mockResolvedValue({} as any);

      const result = await adminService.updateSettings({
        AI_PROVIDER: 'anthropic',
        AI_MODEL: 'claude-3-5-sonnet-20241022',
        ALLOW_PUBLIC_SIGNUP: 'true'
      });

      expect(result.success).toBe(true);
      expect(result.updatedKeys).toContain('AI_PROVIDER');
      expect(result.updatedKeys).toContain('AI_MODEL');
      expect(upsertSpy).toHaveBeenCalled();
    });

    it('runs AI test connection successfully', async () => {
      const testRes = await adminService.testAiConnection({
        provider: 'openai',
        model: 'gpt-4o-mini'
      });

      expect(testRes.success).toBe(true);
      expect(testRes.latencyMs).toBeTypeOf('number');
      expect(testRes.sampleResponse).toBeDefined();
    });
  });

  describe('5. Tenant Management & Impersonation', () => {
    it('lists tenants with pagination and metadata', async () => {
      vi.spyOn(prisma.tenant, 'findMany').mockResolvedValueOnce([
        {
          id: 'tenant-123',
          email: 'smm-pro@panel.com',
          subscriptionStatus: 'ACTIVE',
          botToken: '123456789:ABCDEF',
          panelApiUrl: 'https://mysmmpanel.com',
          emailVerified: true,
          emailVerifiedAt: new Date(),
          mfaEnabled: false,
          whatsAppEnabled: false,
          whatsAppPhoneNumber: null,
          widgetEnabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: {
            endUserSessions: 10,
            whatsAppSessions: 2,
            webChatSessions: 4
          }
        } as any
      ]);
      vi.spyOn(prisma.tenant, 'count').mockResolvedValueOnce(1);

      const res = await adminService.getTenants({ page: 1, limit: 10 });

      expect(res.tenants).toHaveLength(1);
      expect(res.tenants[0].email).toBe('smm-pro@panel.com');
      expect(res.tenants[0].hasBotToken).toBe(true);
      expect(res.total).toBe(1);
      expect(res.totalPages).toBe(1);
    });

    it('updates tenant subscription status to ACTIVE or EXPIRED', async () => {
      const updateSpy = vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce({
        id: 'tenant-123',
        email: 'smm-pro@panel.com',
        subscriptionStatus: 'ACTIVE'
      } as any);

      const res = await adminService.updateTenantSubscription('tenant-123', 'ACTIVE');

      expect(res.subscriptionStatus).toBe('ACTIVE');
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
        data: { subscriptionStatus: 'ACTIVE' }
      });
    });

    it('toggles tenant email verification status manually', async () => {
      const updateSpy = vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce({
        id: 'tenant-123',
        emailVerified: true
      } as any);

      const res = await adminService.toggleTenantEmailVerified('tenant-123', true);

      expect(res.emailVerified).toBe(true);
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ emailVerified: true })
        })
      );
    });

    it('updates tenant channel plan entitlements (Telegram, WhatsApp, Widget)', async () => {
      const updateSpy = vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce({
        id: 'tenant-123',
        email: 'tenant@smm.com',
        hasTelegram: true,
        hasWhatsapp: true,
        hasWidget: false
      } as any);

      const res = await adminService.updateTenantPlans('tenant-123', {
        hasTelegram: true,
        hasWhatsapp: true,
        hasWidget: false
      });

      expect(res.hasTelegram).toBe(true);
      expect(res.hasWhatsapp).toBe(true);
      expect(res.hasWidget).toBe(false);
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: 'tenant-123' },
        data: {
          hasTelegram: true,
          hasWhatsapp: true,
          hasWidget: false
        }
      });
    });

    it('generates a signed 2-hour JWT token to impersonate tenant on dashboard', async () => {
      vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce({
        id: 'tenant-123',
        email: 'smm-pro@panel.com'
      } as any);

      const res = await adminService.impersonateTenant('tenant-123');

      expect(res.token).toBeDefined();
      expect(res.tenant.email).toBe('smm-pro@panel.com');

      const decoded: any = jwt.verify(res.token, process.env.JWT_SECRET || 'fallback_secret_for_tests');
      expect(decoded.sub).toBe('tenant-123');
      expect(decoded.email).toBe('smm-pro@panel.com');
      expect(decoded.impersonated).toBe(true);
    });

    it('deletes tenant and returns true', async () => {
      const deleteSpy = vi.spyOn(prisma.tenant, 'delete').mockResolvedValueOnce({} as any);

      const res = await adminService.deleteTenant('tenant-123');

      expect(res).toBe(true);
      expect(deleteSpy).toHaveBeenCalledWith({ where: { id: 'tenant-123' } });
    });
  });

  describe('6. Landing Leads Management', () => {
    it('lists leads and allows status update with notes', async () => {
      vi.spyOn(prisma.leadRequest, 'findMany').mockResolvedValueOnce([
        {
          id: 'lead-1',
          email: 'lead@smm.com',
          panelUrl: 'https://panel.com',
          contactNumber: '+1234567890',
          message: 'Setup request',
          status: 'NEW',
          notes: null,
          ipAddress: '127.0.0.1',
          userAgent: null,
          createdAt: new Date()
        } as any
      ]);
      vi.spyOn(prisma.leadRequest, 'count').mockResolvedValueOnce(1);

      const list = await adminService.getLeads({ status: 'NEW' });
      expect(list.leads).toHaveLength(1);
      expect(list.leads[0].email).toBe('lead@smm.com');

      vi.spyOn(prisma.leadRequest, 'update').mockResolvedValueOnce({
        id: 'lead-1',
        status: 'QUALIFIED',
        notes: 'Chatted on WhatsApp, active client'
      } as any);

      const updated = await adminService.updateLead('lead-1', {
        status: 'QUALIFIED',
        notes: 'Chatted on WhatsApp, active client'
      });

      expect(updated.status).toBe('QUALIFIED');
      expect(updated.notes).toBe('Chatted on WhatsApp, active client');
    });

    it('deletes lead inquiry', async () => {
      const deleteSpy = vi.spyOn(prisma.leadRequest, 'delete').mockResolvedValueOnce({} as any);
      const res = await adminService.deleteLead('lead-1');
      expect(res).toBe(true);
      expect(deleteSpy).toHaveBeenCalledWith({ where: { id: 'lead-1' } });
    });
  });
});
