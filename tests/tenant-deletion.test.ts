import { describe, it, expect, vi, beforeEach } from 'vitest';
import { purgeTenantResources, TenantsService } from '../src/tenants/tenants.service.js';
import { AdminService } from '../src/admin/admin.service.js';
import { BotManagerService } from '../src/bot-engine/bot-manager.service.js';
import { WhatsAppBotManagerService } from '../src/whatsapp-engine/whatsapp-bot-manager.service.js';
import { prisma } from '../src/common/database/prisma.js';
import { redis } from '../src/common/redis/redis.js';
import { authService } from '../src/auth/auth.service.js';
import { AuditLogService } from '../src/common/audit/audit-log.service.js';

describe('Phase 8: Safe Tenant Resource Deletion Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  describe('1. purgeTenantResources Unified Teardown', () => {
    it('halts Telegram bot, stops WhatsApp, clears auth files, purges Redis keys, and deletes from DB', async () => {
      const tenantId = 'tenant-del-test-1';

      const stopBotSpy = vi.spyOn(BotManagerService.getInstance(), 'stopTenantBot').mockResolvedValue();
      const deleteWaSessionSpy = vi.spyOn(WhatsAppBotManagerService.getInstance(), 'deleteSession').mockResolvedValue();

      // Mock Redis scanStream & del
      const redisDelSpy = vi.spyOn(redis, 'del').mockResolvedValue(1);
      const scanStreamMock = {
        on: vi.fn((event: string, handler: any) => {
          if (event === 'data') {
            handler([`tenant:${tenantId}:status`, `tenant:${tenantId}:custom`]);
          }
          if (event === 'end') {
            handler();
          }
          return scanStreamMock;
        })
      };
      vi.spyOn(redis, 'scanStream').mockReturnValue(scanStreamMock as any);

      const dbDeleteSpy = vi.spyOn(prisma.tenant, 'delete').mockResolvedValue({ id: tenantId } as any);

      await purgeTenantResources(tenantId);

      // 1. Telegram bot stopped
      expect(stopBotSpy).toHaveBeenCalledWith(tenantId);

      // 2. WhatsApp disconnected and auth cleared
      expect(deleteWaSessionSpy).toHaveBeenCalledWith(tenantId);

      // 3. Redis keys deleted
      expect(redisDelSpy).toHaveBeenCalledWith(
        expect.stringContaining(`tenant:${tenantId}:status`),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything()
      );

      // 4. DB deletion executed
      expect(dbDeleteSpy).toHaveBeenCalledWith({ where: { id: tenantId } });
    });

    it('continues DB deletion even if bot shutdown or Redis cleanup throws errors', async () => {
      const tenantId = 'tenant-del-faulty';

      // Both bot shutdown hooks throw errors
      vi.spyOn(BotManagerService.getInstance(), 'stopTenantBot').mockRejectedValue(new Error('Bot process not found'));
      vi.spyOn(WhatsAppBotManagerService.getInstance(), 'deleteSession').mockRejectedValue(new Error('Socket disconnected'));

      // Redis throws
      vi.spyOn(redis, 'del').mockRejectedValue(new Error('Redis connection refused'));
      vi.spyOn(redis, 'scanStream').mockImplementation(() => {
        throw new Error('Redis offline');
      });

      const dbDeleteSpy = vi.spyOn(prisma.tenant, 'delete').mockResolvedValue({ id: tenantId } as any);

      // Must complete without unhandled rejection
      await expect(purgeTenantResources(tenantId)).resolves.not.toThrow();

      // DB deletion must still occur
      expect(dbDeleteSpy).toHaveBeenCalledWith({ where: { id: tenantId } });
    });
  });

  describe('2. TenantsService.deleteAccount Self-Deletion', () => {
    it('verifies password confirmation and delegates to purgeTenantResources', async () => {
      const tenantId = 'tenant-self-del';
      const tenantsService = new TenantsService();

      vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({
        id: tenantId,
        passwordHash: '$argon2id$hashed'
      } as any);

      vi.spyOn(authService, 'verifyPassword').mockResolvedValue(true);
      const auditSpy = vi.spyOn(AuditLogService, 'record').mockResolvedValue();
      const stopBotSpy = vi.spyOn(BotManagerService.getInstance(), 'stopTenantBot').mockResolvedValue();
      const deleteWaSpy = vi.spyOn(WhatsAppBotManagerService.getInstance(), 'deleteSession').mockResolvedValue();
      const dbDeleteSpy = vi.spyOn(prisma.tenant, 'delete').mockResolvedValue({ id: tenantId } as any);
      vi.spyOn(redis, 'del').mockResolvedValue(1);

      const result = await tenantsService.deleteAccount(tenantId, 'CorrectPassword123!', {
        ip: '10.0.0.1',
        userAgent: 'Browser'
      });

      expect(result.success).toBe(true);
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          action: 'TENANT_ACCOUNT_DELETED'
        })
      );
      expect(stopBotSpy).toHaveBeenCalledWith(tenantId);
      expect(deleteWaSpy).toHaveBeenCalledWith(tenantId);
      expect(dbDeleteSpy).toHaveBeenCalledWith({ where: { id: tenantId } });
    });
  });

  describe('3. AdminService.deleteTenant Admin Deletion', () => {
    it('delegates directly to purgeTenantResources and cleans up all active services', async () => {
      const tenantId = 'tenant-admin-del';
      const adminService = AdminService.getInstance();

      const stopBotSpy = vi.spyOn(BotManagerService.getInstance(), 'stopTenantBot').mockResolvedValue();
      const deleteWaSpy = vi.spyOn(WhatsAppBotManagerService.getInstance(), 'deleteSession').mockResolvedValue();
      const dbDeleteSpy = vi.spyOn(prisma.tenant, 'delete').mockResolvedValue({ id: tenantId } as any);
      vi.spyOn(redis, 'del').mockResolvedValue(1);

      const res = await adminService.deleteTenant(tenantId);

      expect(res).toBe(true);
      expect(stopBotSpy).toHaveBeenCalledWith(tenantId);
      expect(deleteWaSpy).toHaveBeenCalledWith(tenantId);
      expect(dbDeleteSpy).toHaveBeenCalledWith({ where: { id: tenantId } });
    });
  });
});
