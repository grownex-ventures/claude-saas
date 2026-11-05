import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tenantStatusKey } from '../src/common/redis/keys.js';
import { redis } from '../src/common/redis/redis.js';
import { prisma } from '../src/common/database/prisma.js';
import { verifyActiveSubscription } from '../src/common/middleware/tenant-access.middleware.js';
import { AdminService } from '../src/admin/admin.service.js';
import { BillingService } from '../src/billing/billing.service.js';
import { TenantsService } from '../src/tenants/tenants.service.js';
import { BotManagerService } from '../src/bot-engine/bot-manager.service.js';
import { WhatsAppBotManagerService } from '../src/whatsapp-engine/whatsapp-bot-manager.service.js';
import { InvoiceStatus } from '@prisma/client';

describe('Phase 5: Standardized Subscription State and Lifecycle Suite', () => {
  let adminService: AdminService;
  let billingService: BillingService;
  let tenantsService: TenantsService;
  let mockBotManager: any;
  let mockWhatsAppManager: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockBotManager = {
      startTenantBot: vi.fn().mockResolvedValue(undefined),
      stopTenantBot: vi.fn().mockResolvedValue(undefined),
      isBotRunning: vi.fn().mockReturnValue(true)
    };

    mockWhatsAppManager = {
      startTenantWhatsApp: vi.fn().mockResolvedValue({ isConnected: () => true }),
      stopTenantWhatsApp: vi.fn().mockResolvedValue(undefined),
      getService: vi.fn().mockReturnValue(null)
    };

    adminService = AdminService.getInstance();
    adminService.setBotManagerService(mockBotManager as unknown as BotManagerService);
    adminService.setWhatsAppBotManagerService(mockWhatsAppManager as unknown as WhatsAppBotManagerService);

    billingService = BillingService.getInstance();
    tenantsService = new TenantsService(
      { crawlAndCachePanel: vi.fn().mockResolvedValue([]) } as any,
      mockBotManager as unknown as BotManagerService,
      mockWhatsAppManager as unknown as WhatsAppBotManagerService
    );
  });

  describe('1. Canonical Key Helper', () => {
    it('returns exact canonical Redis key format tenant:<tenantId>:status', () => {
      const key1 = tenantStatusKey('tenant-abc-123');
      expect(key1).toBe('tenant:tenant-abc-123:status');

      const key2 = tenantStatusKey('uuid-v4-9988');
      expect(key2).toBe('tenant:uuid-v4-9988:status');
    });
  });

  describe('2. TTL on Status Writes', () => {
    it('middleware verifyActiveSubscription caches status with 3600s TTL', async () => {
      const redisGetSpy = vi.spyOn(redis, 'get').mockResolvedValueOnce(null);
      const redisSetSpy = vi.spyOn(redis, 'set').mockResolvedValue('OK');
      const prismaSpy = vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce({
        id: 'tenant-1',
        subscriptionStatus: 'ACTIVE'
      } as any);

      const isActive = await verifyActiveSubscription('tenant-1');

      expect(isActive).toBe(true);
      expect(redisGetSpy).toHaveBeenCalledWith('tenant:tenant-1:status');
      expect(redisSetSpy).toHaveBeenCalledWith('tenant:tenant-1:status', 'ACTIVE', 'EX', 3600);
    });

    it('tenantsService.activate caches ACTIVE with 3600s TTL using canonical key', async () => {
      vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce({
        id: 't-activate',
        hasTelegram: true,
        botToken: 'token',
        panelApiUrl: 'https://panel.com'
      } as any);
      vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce({
        id: 't-activate',
        hasTelegram: true,
        botToken: 'token',
        panelApiUrl: 'https://panel.com',
        subscriptionStatus: 'ACTIVE'
      } as any);
      const redisSetSpy = vi.spyOn(redis, 'set').mockResolvedValue('OK');

      await tenantsService.activate('t-activate');

      expect(redisSetSpy).toHaveBeenCalledWith('tenant:t-activate:status', 'ACTIVE', 'EX', 3600);
    });

    it('tenantsService.deactivate caches EXPIRED with 3600s TTL using canonical key', async () => {
      vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce({
        id: 't-deactivate'
      } as any);
      vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce({
        id: 't-deactivate',
        subscriptionStatus: 'EXPIRED'
      } as any);
      const redisSetSpy = vi.spyOn(redis, 'set').mockResolvedValue('OK');

      await tenantsService.deactivate('t-deactivate');

      expect(redisSetSpy).toHaveBeenCalledWith('tenant:t-deactivate:status', 'EXPIRED', 'EX', 3600);
    });

    it('adminService.updateTenantSubscription caches status with 3600s TTL using canonical key', async () => {
      vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce({
        id: 't-admin-ttl',
        email: 't@example.com',
        subscriptionStatus: 'ACTIVE',
        hasTelegram: false,
        hasWhatsapp: false
      } as any);
      const redisSetSpy = vi.spyOn(redis, 'set').mockResolvedValue('OK');

      await adminService.updateTenantSubscription('t-admin-ttl', 'ACTIVE');

      expect(redisSetSpy).toHaveBeenCalledWith('tenant:t-admin-ttl:status', 'ACTIVE', 'EX', 3600);
    });
  });

  describe('3. Payment Activation Replacing Cached EXPIRED', () => {
    it('overwrites cached EXPIRED status in Redis with ACTIVE and 3600s TTL on payment activation', async () => {
      const mockInvoice = {
        id: 'inv-1',
        orderId: 'ORD-1234',
        tenantId: 'tenant-renew',
        status: InvoiceStatus.PENDING,
        amount: 29.00,
        currency: 'USD',
        isMock: false,
        channels: ['telegram'],
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        paidAt: null,
        tenant: {
          id: 'tenant-renew',
          subscriptionStatus: 'EXPIRED',
          subscriptionExpiresAt: null,
          hasTelegram: false,
          hasWhatsapp: false,
          hasWidget: false
        }
      };

      vi.spyOn(prisma.paymentInvoice, 'findUnique').mockResolvedValueOnce(mockInvoice as any);
      vi.spyOn(prisma.paymentInvoice, 'update').mockResolvedValueOnce({} as any);
      vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce({} as any);
      vi.spyOn(prisma, '$transaction').mockResolvedValueOnce([
        { ...mockInvoice, status: InvoiceStatus.PAID, paidAt: new Date() },
        { id: 'tenant-renew', subscriptionStatus: 'ACTIVE', hasTelegram: true }
      ] as any);

      const redisSetSpy = vi.spyOn(redis, 'set').mockResolvedValue('OK');

      const res = await billingService.markInvoicePaidByAdmin('ORD-1234', 'admin-id-1');

      expect(res.success).toBe(true);
      expect(redisSetSpy).toHaveBeenCalledWith(
        tenantStatusKey('tenant-renew'),
        'ACTIVE',
        'EX',
        3600
      );
    });
  });

  describe('4. Admin ACTIVE Lifecycle', () => {
    it('starts only configured and entitled channels when transitioning to ACTIVE', async () => {
      vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce({
        id: 't-both-channels',
        email: 'both@example.com',
        subscriptionStatus: 'ACTIVE',
        hasTelegram: true,
        botToken: 'bot-token-tg',
        telegramPanelUrl: 'https://tg-panel.com',
        hasWhatsapp: true,
        whatsAppEnabled: true,
        whatsAppPhoneNumber: '+1234567890'
      } as any);
      const redisSetSpy = vi.spyOn(redis, 'set').mockResolvedValue('OK');

      const res = await adminService.updateTenantSubscription('t-both-channels', 'ACTIVE');

      expect(res.subscriptionStatus).toBe('ACTIVE');
      expect(redisSetSpy).toHaveBeenCalledWith('tenant:t-both-channels:status', 'ACTIVE', 'EX', 3600);
      expect(mockBotManager.startTenantBot).toHaveBeenCalledWith({
        tenantId: 't-both-channels',
        botToken: 'bot-token-tg',
        panelApiUrl: 'https://tg-panel.com',
        subscriptionStatus: 'ACTIVE'
      });
      expect(mockWhatsAppManager.startTenantWhatsApp).toHaveBeenCalledWith(
        't-both-channels',
        '+1234567890'
      );
    });

    it('does not start channels that are not entitled or not configured', async () => {
      vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce({
        id: 't-tg-only',
        email: 'tg@example.com',
        subscriptionStatus: 'ACTIVE',
        hasTelegram: true,
        botToken: 'bot-token-tg',
        panelApiUrl: 'https://panel.com',
        hasWhatsapp: false,
        whatsAppEnabled: false
      } as any);
      vi.spyOn(redis, 'set').mockResolvedValue('OK');

      await adminService.updateTenantSubscription('t-tg-only', 'ACTIVE');

      expect(mockBotManager.startTenantBot).toHaveBeenCalled();
      expect(mockWhatsAppManager.startTenantWhatsApp).not.toHaveBeenCalled();
    });
  });

  describe('5. Admin INACTIVE/EXPIRED Lifecycle', () => {
    it('stops both Telegram and WhatsApp bots when admin transitions to INACTIVE', async () => {
      vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce({
        id: 't-stop',
        email: 'stop@example.com',
        subscriptionStatus: 'INACTIVE'
      } as any);
      const redisSetSpy = vi.spyOn(redis, 'set').mockResolvedValue('OK');

      const res = await adminService.updateTenantSubscription('t-stop', 'INACTIVE');

      expect(res.subscriptionStatus).toBe('INACTIVE');
      expect(redisSetSpy).toHaveBeenCalledWith('tenant:t-stop:status', 'INACTIVE', 'EX', 3600);
      expect(mockBotManager.stopTenantBot).toHaveBeenCalledWith('t-stop');
      expect(mockWhatsAppManager.stopTenantWhatsApp).toHaveBeenCalledWith('t-stop');
    });

    it('stops both Telegram and WhatsApp bots when admin transitions to EXPIRED', async () => {
      vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce({
        id: 't-expired',
        email: 'exp@example.com',
        subscriptionStatus: 'EXPIRED'
      } as any);
      const redisSetSpy = vi.spyOn(redis, 'set').mockResolvedValue('OK');

      const res = await adminService.updateTenantSubscription('t-expired', 'EXPIRED');

      expect(res.subscriptionStatus).toBe('EXPIRED');
      expect(redisSetSpy).toHaveBeenCalledWith('tenant:t-expired:status', 'EXPIRED', 'EX', 3600);
      expect(mockBotManager.stopTenantBot).toHaveBeenCalledWith('t-expired');
      expect(mockWhatsAppManager.stopTenantWhatsApp).toHaveBeenCalledWith('t-expired');
    });
  });

  describe('6. Redis Unavailable Resilience', () => {
    it('persists DB status and succeeds even if Redis throws connection error on write', async () => {
      vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce({
        id: 't-redis-down',
        email: 'down@example.com',
        subscriptionStatus: 'ACTIVE',
        hasTelegram: false,
        hasWhatsapp: false
      } as any);
      vi.spyOn(redis, 'set').mockRejectedValueOnce(new Error('ECONNREFUSED - Redis is offline'));

      const res = await adminService.updateTenantSubscription('t-redis-down', 'ACTIVE');

      expect(res.subscriptionStatus).toBe('ACTIVE');
      expect(res.id).toBe('t-redis-down');
    });

    it('verifyActiveSubscription falls back to Prisma database if Redis get throws', async () => {
      vi.spyOn(redis, 'get').mockRejectedValueOnce(new Error('Redis cluster down'));
      vi.spyOn(redis, 'set').mockRejectedValueOnce(new Error('Redis write failed'));
      vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce({
        id: 't-redis-down-check',
        subscriptionStatus: 'ACTIVE'
      } as any);

      const isActive = await verifyActiveSubscription('t-redis-down-check');

      expect(isActive).toBe(true);
    });
  });

  describe('7. Partial Channel Startup Failure Resilience', () => {
    it('keeps DB status ACTIVE and returns channel errors when WhatsApp fails to connect', async () => {
      vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce({
        id: 't-wa-fail',
        email: 'wafail@example.com',
        subscriptionStatus: 'ACTIVE',
        hasTelegram: true,
        botToken: 'bot-tg-ok',
        telegramPanelUrl: 'https://tg.com',
        hasWhatsapp: true,
        whatsAppEnabled: true,
        whatsAppPhoneNumber: '+19999999999'
      } as any);
      vi.spyOn(redis, 'set').mockResolvedValue('OK');

      mockBotManager.startTenantBot.mockResolvedValueOnce(undefined);
      mockWhatsAppManager.startTenantWhatsApp.mockRejectedValueOnce(
        new Error('Baileys connection socket closed with 401 Unauthorized')
      );

      const res = await adminService.updateTenantSubscription('t-wa-fail', 'ACTIVE');

      // Crucial: The database status must remain ACTIVE
      expect(res.subscriptionStatus).toBe('ACTIVE');
      expect(res.id).toBe('t-wa-fail');
      // Telegram successfully started
      expect(mockBotManager.startTenantBot).toHaveBeenCalled();
      // WhatsApp failure clearly reported without throwing or rolling back DB
      expect(res.channelErrors).toBeDefined();
      expect(res.channelErrors![0]).toContain('WhatsApp failed to start: Baileys connection socket closed');
      expect(res.warnings).toBeDefined();
    });
  });
});
