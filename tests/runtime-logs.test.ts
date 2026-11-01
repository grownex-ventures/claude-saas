import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RuntimeLogService, RuntimeLogItem } from '../src/common/logging/runtime-log.service.js';
import { redis } from '../src/common/redis/redis.js';
import { prisma } from '../src/common/database/prisma.js';
import { TenantsController } from '../src/tenants/tenants.controller.js';
import { AuthenticatedRequest } from '../src/common/middleware/tenant-access.middleware.js';

describe('Runtime Logs & Operational Telemetry Suite', () => {
  const tenantId = 'tenant-test-telemetry-123';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('RuntimeLogService.record', () => {
    it('records an operational event with multi-tenant Redis ring buffer and 7-day TTL', async () => {
      const mockPipeline = {
        lpush: vi.fn().mockReturnThis(),
        ltrim: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([null, null, null])
      };
      vi.spyOn(redis, 'pipeline').mockReturnValue(mockPipeline as any);

      await RuntimeLogService.record({
        tenantId,
        channel: 'telegram',
        level: 'info',
        event: 'CMD_START',
        message: 'Customer started bot session',
        details: { userId: 'tg-987' }
      });

      expect(mockPipeline.lpush).toHaveBeenCalledWith(
        `tenant:${tenantId}:runtime_logs`,
        expect.stringContaining('"channel":"telegram"')
      );
      expect(mockPipeline.ltrim).toHaveBeenCalledWith(`tenant:${tenantId}:runtime_logs`, 0, 499);
      expect(mockPipeline.expire).toHaveBeenCalledWith(`tenant:${tenantId}:runtime_logs`, 604800);
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it('sanitizes sensitive tokens and keys in log details before storing in Redis', async () => {
      let savedPayload = '';
      const mockPipeline = {
        lpush: vi.fn().mockImplementation((_key, payload) => {
          savedPayload = String(payload);
          return mockPipeline;
        }),
        ltrim: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([null, null, null])
      };
      vi.spyOn(redis, 'pipeline').mockReturnValue(mockPipeline as any);

      await RuntimeLogService.record({
        tenantId,
        channel: 'whatsapp',
        level: 'warn',
        event: 'AUTH_FAILED',
        message: 'Invalid credentials provided',
        details: {
          apiKey: 'super_secret_api_key_xyz_1234',
          botToken: '123456789:ABCDefghIJKLmnopQRSTuvwx_5678',
          password: 'plainUserPassword!999',
          safeField: 'normalParam'
        }
      });

      const parsed = JSON.parse(savedPayload);
      expect(parsed.details.safeField).toBe('normalParam');
      expect(parsed.details.apiKey).toBe('***...1234');
      expect(parsed.details.botToken).toBe('***...5678');
      expect(parsed.details.password).toBe('***...!999');
      expect(savedPayload).not.toContain('super_secret_api_key_xyz');
    });

    it('never throws into the caller path when Redis is unavailable', async () => {
      vi.spyOn(redis, 'pipeline').mockImplementation(() => {
        throw new Error('Redis Connection Lost');
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await expect(
        RuntimeLogService.record({
          tenantId,
          channel: 'widget',
          level: 'error',
          event: 'WIDGET_ERROR',
          message: 'Chat service temporary failure'
        })
      ).resolves.not.toThrow();

      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('RuntimeLogService.getLogs', () => {
    const mockLogs: RuntimeLogItem[] = [
      {
        id: 'log-1',
        tenantId,
        timestamp: '2026-11-02T02:00:00.000Z',
        channel: 'telegram',
        level: 'info',
        event: 'CMD_START',
        message: 'User ran /start command',
        details: { userId: '111' }
      },
      {
        id: 'log-2',
        tenantId,
        timestamp: '2026-11-02T02:01:00.000Z',
        channel: 'whatsapp',
        level: 'error',
        event: 'CONN_DROPPED',
        message: 'Socket connection was closed',
        details: { reason: 'timed out' }
      },
      {
        id: 'log-3',
        tenantId,
        timestamp: '2026-11-02T02:02:00.000Z',
        channel: 'widget',
        level: 'success',
        event: 'MESSAGE_SENT',
        message: 'Visitor requested price list for YouTube',
        details: { visitorId: 'vis-1' }
      }
    ];

    it('returns parsed logs from Redis and filters by channel', async () => {
      vi.spyOn(redis, 'lrange').mockResolvedValue(mockLogs.map(l => JSON.stringify(l)));

      const result = await RuntimeLogService.getLogs(tenantId, {
        channel: 'whatsapp'
      });

      expect(result.logs.length).toBe(1);
      expect(result.logs[0].channel).toBe('whatsapp');
      expect(result.logs[0].event).toBe('CONN_DROPPED');
    });

    it('filters logs by severity level', async () => {
      vi.spyOn(redis, 'lrange').mockResolvedValue(mockLogs.map(l => JSON.stringify(l)));

      const result = await RuntimeLogService.getLogs(tenantId, {
        level: 'error'
      });

      expect(result.logs.length).toBe(1);
      expect(result.logs[0].level).toBe('error');
    });

    it('searches logs by text match across message, event, and details', async () => {
      vi.spyOn(redis, 'lrange').mockResolvedValue(mockLogs.map(l => JSON.stringify(l)));

      const result = await RuntimeLogService.getLogs(tenantId, {
        search: 'YouTube'
      });

      expect(result.logs.length).toBe(1);
      expect(result.logs[0].channel).toBe('widget');
    });

    it('falls back to PostgreSQL AuditLog when Redis buffer has fewer than 20 entries', async () => {
      // Redis has 1 log
      vi.spyOn(redis, 'lrange').mockResolvedValue([JSON.stringify(mockLogs[0])]);
      const auditFindSpy = vi.spyOn(prisma.auditLog, 'findMany').mockResolvedValue([
        {
          id: 'audit-row-1',
          tenantId,
          action: 'TELEGRAM_BOT_STARTED',
          actorIp: '127.0.0.1',
          userAgent: 'Chrome',
          metadata: { botUsername: 'TestBot' },
          createdAt: new Date('2026-11-02T01:50:00.000Z')
        }
      ] as any);

      const result = await RuntimeLogService.getLogs(tenantId);

      expect(auditFindSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId }
        })
      );
      expect(result.logs.length).toBe(2);
      expect(result.logs.some(l => l.event === 'TELEGRAM_BOT_STARTED')).toBe(true);
    });
  });

  describe('RuntimeLogService.clearLogs', () => {
    it('deletes the multi-tenant Redis ring buffer', async () => {
      const delSpy = vi.spyOn(redis, 'del').mockResolvedValue(1 as any);

      await RuntimeLogService.clearLogs(tenantId);

      expect(delSpy).toHaveBeenCalledWith(`tenant:${tenantId}:runtime_logs`);
    });
  });

  describe('TenantsController logs endpoints', () => {
    it('GET /api/v1/tenants/logs returns filtered log response for authenticated tenant', async () => {
      vi.spyOn(RuntimeLogService, 'getLogs').mockResolvedValue({
        logs: [
          {
            id: 'log-ctrl-1',
            tenantId,
            timestamp: new Date().toISOString(),
            channel: 'widget',
            level: 'info',
            event: 'CHAT_INIT',
            message: 'Chat initialized'
          }
        ],
        total: 1
      });

      const controller = new TenantsController();
      const req = {
        tenantId,
        query: { channel: 'widget', limit: '25' }
      } as unknown as AuthenticatedRequest;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;

      await controller.getLogs(req, res);

      expect(RuntimeLogService.getLogs).toHaveBeenCalledWith(tenantId, {
        channel: 'widget',
        level: undefined,
        search: undefined,
        limit: 25
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        logs: expect.any(Array),
        total: 1
      });
    });

    it('DELETE /api/v1/tenants/logs clears tenant buffer and returns 200', async () => {
      const clearSpy = vi.spyOn(RuntimeLogService, 'clearLogs').mockResolvedValue();

      const controller = new TenantsController();
      const req = { tenantId } as unknown as AuthenticatedRequest;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;

      await controller.clearLogs(req, res);

      expect(clearSpy).toHaveBeenCalledWith(tenantId);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Runtime logs cleared'
      });
    });
  });
});
