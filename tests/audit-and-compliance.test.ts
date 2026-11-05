import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditLogService } from '../src/common/audit/audit-log.service.js';
import { RetentionCleanerService } from '../src/common/jobs/retention-cleaner.js';
import { TenantsService } from '../src/tenants/tenants.service.js';
import { prisma } from '../src/common/database/prisma.js';
import { redis } from '../src/common/redis/redis.js';
import { authService } from '../src/auth/auth.service.js';

describe('Audit & Compliance Suite (COMP-01 & COMP-02)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('AuditLogService (COMP-01)', () => {
    it('records an audit entry and sanitizes sensitive metadata', async () => {
      const createSpy = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({
        id: 'log-1',
        tenantId: 'tenant-123',
        action: 'WIDGET_API_KEY_UPDATED',
        actorIp: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        metadata: { apiKey: '***...abcd' },
        createdAt: new Date()
      } as any);

      await AuditLogService.record({
        tenantId: 'tenant-123',
        action: 'WIDGET_API_KEY_UPDATED',
        actorIp: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        metadata: {
          apiKey: 'super_secret_api_key_12345678abcd',
          userPassword: 'myPlainPassword123!',
          safeField: 'normalValue'
        }
      });

      expect(createSpy).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-123',
          action: 'WIDGET_API_KEY_UPDATED',
          actorIp: '127.0.0.1',
          userAgent: 'Mozilla/5.0',
          metadata: expect.objectContaining({
            safeField: 'normalValue',
            apiKey: '***...abcd',
            userPassword: '***...123!'
          })
        })
      });
    });

    it('never throws into the request path even if Prisma throws an error', async () => {
      vi.spyOn(prisma.auditLog, 'create').mockRejectedValue(new Error('DB Connection Timeout'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(
        AuditLogService.record({
          tenantId: 'tenant-123',
          action: 'AUTH_LOGIN_FAILURE',
          actorIp: '192.168.1.1'
        })
      ).resolves.not.toThrow();

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('RetentionCleanerService (COMP-02 b)', () => {
    it('purges messages older than retention cutoff using distributed Redis lock', async () => {
      vi.spyOn(redis, 'set').mockResolvedValue('OK');
      const deleteManySpy = vi.spyOn(prisma.webChatMessage, 'deleteMany').mockResolvedValue({
        count: 42
      });
      const tgDeleteSpy = vi.spyOn(prisma.telegramChatMessage, 'deleteMany').mockResolvedValue({
        count: 10
      });
      const waDeleteSpy = vi.spyOn(prisma.whatsAppChatMessage, 'deleteMany').mockResolvedValue({
        count: 5
      });

      const result = await RetentionCleanerService.purgeExpiredChatMessages();

      expect(result.skipped).toBe(false);
      expect(result.purgedCount).toBe(57);
      expect(result.details).toEqual({ web: 42, telegram: 10, whatsapp: 5 });
      expect(deleteManySpy).toHaveBeenCalledWith({
        where: {
          createdAt: {
            lt: expect.any(Date)
          }
        }
      });
      expect(tgDeleteSpy).toHaveBeenCalled();
      expect(waDeleteSpy).toHaveBeenCalled();
    });

    it('skips cleanup if Redis lock is already held by another cluster instance', async () => {
      vi.spyOn(redis, 'set').mockResolvedValue(null as any); // Lock not acquired
      const deleteManySpy = vi.spyOn(prisma.webChatMessage, 'deleteMany');

      const result = await RetentionCleanerService.purgeExpiredChatMessages();

      expect(result.skipped).toBe(true);
      expect(result.purgedCount).toBe(0);
      expect(deleteManySpy).not.toHaveBeenCalled();
    });
  });

  describe('Tenant Account Deletion (COMP-02 a)', () => {
    const tenantsService = new TenantsService();

    it('rejects deletion if password confirmation is missing or invalid', async () => {
      await expect(tenantsService.deleteAccount('t-1', '')).rejects.toThrow(
        /Password confirmation is required/
      );

      vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({
        id: 't-1',
        passwordHash: '$argon2id$mock'
      } as any);
      vi.spyOn(authService, 'verifyPassword').mockResolvedValue(false);

      await expect(tenantsService.deleteAccount('t-1', 'wrong-pass')).rejects.toThrow(
        /Invalid password confirmation/
      );
    });

    it('successfully cascades tenant deletion, logs audit, and clears Redis keys', async () => {
      vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({
        id: 't-1',
        passwordHash: '$argon2id$mock'
      } as any);
      vi.spyOn(authService, 'verifyPassword').mockResolvedValue(true);
      const auditSpy = vi.spyOn(AuditLogService, 'record').mockResolvedValue();
      const redisDelSpy = vi.spyOn(redis, 'del').mockResolvedValue(1);
      const txSpy = vi.spyOn(prisma, '$transaction').mockResolvedValue([{} as any]);

      const result = await tenantsService.deleteAccount('t-1', 'valid-password', {
        ip: '127.0.0.1',
        userAgent: 'TestAgent'
      });

      expect(result.success).toBe(true);
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 't-1',
          action: 'TENANT_ACCOUNT_DELETED'
        })
      );
      expect(redisDelSpy).toHaveBeenCalled();
      expect(txSpy).toHaveBeenCalled();
    });
  });
});
