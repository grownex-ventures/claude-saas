import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminService } from '../src/admin/admin.service.js';
import { prisma } from '../src/common/database/prisma.js';
import { redis } from '../src/common/redis/redis.js';

describe('Admin Complimentary Agent Access Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('grants lifetime free access to all agents and activates subscription in DB & Redis', async () => {
    const mockUpdatedTenant = {
      id: 'tenant-free-1',
      email: 'vip-free@panel.com',
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiresAt: new Date(Date.now() + 36500 * 86400000),
      hasTelegram: true,
      hasWhatsapp: true,
      hasWidget: true,
      botToken: null,
      whatsAppEnabled: false
    };

    vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce(mockUpdatedTenant as any);
    const redisSetSpy = vi.spyOn(redis, 'set').mockResolvedValue('OK' as any);
    const auditSpy = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

    const result = await adminService.grantFreeAccess('tenant-free-1');

    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: 'tenant-free-1' },
      data: expect.objectContaining({
        subscriptionStatus: 'ACTIVE',
        hasTelegram: true,
        hasWhatsapp: true,
        hasWidget: true
      })
    });

    expect(redisSetSpy).toHaveBeenCalledWith('tenant:tenant-free-1:status', 'ACTIVE', 'EX', 3600);
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-free-1',
          action: 'ADMIN_GRANT_FREE_ACCESS'
        })
      })
    );

    expect(result.subscriptionStatus).toBe('ACTIVE');
    expect(result.hasTelegram).toBe(true);
    expect(result.hasWhatsapp).toBe(true);
    expect(result.hasWidget).toBe(true);
  });

  it('grants specific duration and selective agents (e.g. 30 days, WhatsApp only)', async () => {
    const mockUpdatedTenant = {
      id: 'tenant-free-2',
      email: 'trial-wa@panel.com',
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiresAt: new Date(Date.now() + 30 * 86400000),
      hasTelegram: false,
      hasWhatsapp: true,
      hasWidget: false,
      botToken: null,
      whatsAppEnabled: false
    };

    vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce(mockUpdatedTenant as any);
    vi.spyOn(redis, 'set').mockResolvedValue('OK' as any);
    vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

    const result = await adminService.grantFreeAccess('tenant-free-2', {
      hasTelegram: false,
      hasWhatsapp: true,
      hasWidget: false,
      durationDays: 30
    });

    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: 'tenant-free-2' },
      data: expect.objectContaining({
        subscriptionStatus: 'ACTIVE',
        hasTelegram: false,
        hasWhatsapp: true,
        hasWidget: false
      })
    });

    expect(result.hasTelegram).toBe(false);
    expect(result.hasWhatsapp).toBe(true);
    expect(result.hasWidget).toBe(false);
  });

  it('automatically launches configured Telegram bot when free access is granted', async () => {
    const mockUpdatedTenant = {
      id: 'tenant-free-3',
      email: 'tg-configured@panel.com',
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiresAt: new Date(Date.now() + 36500 * 86400000),
      hasTelegram: true,
      hasWhatsapp: false,
      hasWidget: false,
      botToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
      panelApiUrl: 'https://mysmmpanel.com/api/v2',
      telegramPanelUrl: null,
      whatsAppEnabled: false
    };

    vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce(mockUpdatedTenant as any);
    vi.spyOn(redis, 'set').mockResolvedValue('OK' as any);
    vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

    const startTgSpy = vi
      .spyOn((adminService as any).botManagerService, 'startTenantBot')
      .mockResolvedValueOnce(undefined);

    const result = await adminService.grantFreeAccess('tenant-free-3', {
      hasTelegram: true,
      hasWhatsapp: false,
      hasWidget: false
    });

    expect(startTgSpy).toHaveBeenCalledWith({
      tenantId: 'tenant-free-3',
      botToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
      panelApiUrl: 'https://mysmmpanel.com/api/v2',
      subscriptionStatus: 'ACTIVE'
    });

    expect(result.channelErrors).toBeUndefined();
  });
});

