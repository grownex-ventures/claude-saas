import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TenantsService } from '../src/tenants/tenants.service.js';
import { prisma } from '../src/common/database/prisma.js';
import { redis } from '../src/common/redis/redis.js';
import { SmmProviderClient } from '../src/smm-core/smm-client.js';
import { TelegramBotService } from '../src/bot-engine/telegram-bot.service.js';
import { encrypt } from '../src/common/crypto/encryption.js';

describe('Option B: Operator Live Inbox & Real SMM Panel Connection Testing Suite', () => {
  const testTenantId = 'tenant-opt-b-test';
  let tenantsService: TenantsService;

  beforeEach(() => {
    vi.restoreAllMocks();
    tenantsService = new TenantsService();
  });

  describe('1. SMM Panel Management Endpoints', () => {
    it('getPanelStatus returns structured panel info with masked key and service count', async () => {
      vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce({
        id: testTenantId,
        panelApiUrl: 'https://sastaprovider.com/api/v2',
        widgetPanelUrl: null,
        widgetApiKey: encrypt('secret-api-key-1234567890'),
        crawledData: [{ service: '1', name: 'Followers' }, { service: '2', name: 'Likes' }],
        lastCrawledAt: new Date('2026-11-08T12:00:00Z')
      } as any);

      const status = await tenantsService.getPanelStatus(testTenantId);
      expect(status.connected).toBe(true);
      expect(status.url).toBe('https://sastaprovider.com/api/v2');
      expect(status.name).toBe('sastaprovider');
      expect(status.services).toBe(2);
      expect(status.apiKeyLast4).toBe('7890');
      expect(status.lastSync).toBe('2026-11-08T12:00:00.000Z');
    });

    it('testPanel rejects non-HTTPS or unsafe URLs via SSRF validation', async () => {
      await expect(
        tenantsService.testPanel(testTenantId, 'http://169.254.169.254/metadata', 'valid-key-1234567890')
      ).rejects.toThrow();
    });

    it('testPanel queries real SmmProviderClient and returns balance, services and latency', async () => {
      vi.spyOn(SmmProviderClient.prototype, 'getBalance').mockResolvedValueOnce({
        balance: '42.50',
        currency: 'USD'
      });
      vi.spyOn(SmmProviderClient.prototype, 'getServices').mockResolvedValueOnce([
        { service: '1', name: 'IG Followers', category: 'Instagram', rate: '1.20', min: '10', max: '1000' }
      ]);

      const result = await tenantsService.testPanel(
        testTenantId,
        'https://sastaprovider.com/api/v2',
        'my-valid-api-key-1234567890'
      );

      expect(result.ok).toBe(true);
      expect(result.balance).toBe('42.50');
      expect(result.currency).toBe('USD');
      expect(result.services).toBe(1);
      expect(typeof result.latencyMs).toBe('number');
      expect(result.name).toBe('sastaprovider');
    });

    it('connectPanel updates tenant credentials, runs crawler and returns status', async () => {
      const updateSpy = vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce({
        id: testTenantId,
        panelApiUrl: 'https://sastaprovider.com/api/v2'
      } as any);

      vi.spyOn(tenantsService['panelCrawlerService'], 'crawlAndCachePanel').mockResolvedValueOnce(undefined as any);
      vi.spyOn(prisma.tenant, 'findUnique')
        .mockResolvedValueOnce({ crawledData: [{ service: 1 }] } as any) // for count check
        .mockResolvedValueOnce({
          panelApiUrl: 'https://sastaprovider.com/api/v2',
          widgetApiKey: encrypt('api-key-1234567890'),
          crawledData: [{ service: 1 }],
          lastCrawledAt: new Date()
        } as any); // for getPanelStatus

      const res = await tenantsService.connectPanel(testTenantId, 'https://sastaprovider.com/api/v2', 'api-key-1234567890');
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: testTenantId },
          data: expect.objectContaining({
            panelApiUrl: 'https://sastaprovider.com/api/v2'
          })
        })
      );
      expect(res.connected).toBe(true);
    });

    it('disconnectPanel clears tenant panel fields and purges Redis cache', async () => {
      const updateSpy = vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce({} as any);
      const delSpy = vi.spyOn(redis, 'del').mockResolvedValueOnce(1 as any);

      const res = await tenantsService.disconnectPanel(testTenantId);
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: testTenantId },
          data: expect.objectContaining({
            panelApiUrl: null,
            widgetApiKey: null
          })
        })
      );
      expect(delSpy).toHaveBeenCalled();
      expect(res.ok).toBe(true);
      expect(res.connected).toBe(false);
    });
  });

  describe('2. Operator Live Inbox & Takeover Flow', () => {
    it('getConversations reflects dynamic human takeover status from Redis', async () => {
      vi.spyOn(prisma.botUserSession, 'findMany').mockResolvedValueOnce([
        {
          id: 'bot-session-1',
          tenantId: testTenantId,
          telegramUserId: '111',
          telegramFirstName: 'Alice',
          updatedAt: new Date(),
          messages: [
            { id: 'm1', role: 'user', content: 'Help please', createdAt: new Date() },
            { id: 'm2', role: 'agent', content: 'I am here to help', createdAt: new Date() }
          ]
        }
      ] as any);
      vi.spyOn(prisma.whatsAppSession, 'findMany').mockResolvedValueOnce([]);
      vi.spyOn(prisma.webChatSession, 'findMany').mockResolvedValueOnce([]);
      vi.spyOn(redis, 'mget').mockResolvedValueOnce(['human'] as any);

      const convs = await tenantsService.getConversations(testTenantId);
      expect(convs.length).toBe(1);
      expect(convs[0].status).toBe('human');
      expect(convs[0].messages[1].from).toBe('agent');
      expect(convs[0].customer.name).toBe('Alice');
    });

    it('takeOverConversation sets Redis key conv:status:{id} to human and records system note', async () => {
      vi.spyOn(prisma.botUserSession, 'findFirst').mockResolvedValueOnce({
        id: 'bot-session-1',
        tenantId: testTenantId,
        telegramUserId: '111',
        telegramFirstName: 'Alice'
      } as any);
      vi.spyOn(prisma.whatsAppSession, 'findFirst').mockResolvedValueOnce(null);
      vi.spyOn(prisma.webChatSession, 'findFirst').mockResolvedValueOnce(null);

      const setexSpy = vi.spyOn(redis, 'setex').mockResolvedValueOnce('OK' as any);
      const msgCreateSpy = vi.spyOn(prisma.telegramChatMessage, 'create').mockResolvedValueOnce({} as any);
      vi.spyOn(prisma.botUserSession, 'update').mockResolvedValueOnce({} as any);

      const res = await tenantsService.takeOverConversation(testTenantId, 'bot-session-1');
      expect(setexSpy).toHaveBeenCalledWith('conv:status:bot-session-1', 86400, 'human');
      expect(msgCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'system',
            content: 'You took over from the AI'
          })
        })
      );
      expect(res.success).toBe(true);
      expect(res.status).toBe('human');
    });

    it('handBackConversation deletes Redis takeover key and marks returned to AI', async () => {
      vi.spyOn(prisma.botUserSession, 'findFirst').mockResolvedValueOnce({
        id: 'bot-session-1',
        tenantId: testTenantId,
        telegramUserId: '111',
        telegramFirstName: 'Alice'
      } as any);
      vi.spyOn(prisma.whatsAppSession, 'findFirst').mockResolvedValueOnce(null);
      vi.spyOn(prisma.webChatSession, 'findFirst').mockResolvedValueOnce(null);

      const delSpy = vi.spyOn(redis, 'del').mockResolvedValueOnce(1 as any);
      const msgCreateSpy = vi.spyOn(prisma.telegramChatMessage, 'create').mockResolvedValueOnce({} as any);
      vi.spyOn(prisma.botUserSession, 'update').mockResolvedValueOnce({} as any);

      const res = await tenantsService.handBackConversation(testTenantId, 'bot-session-1');
      expect(delSpy).toHaveBeenCalledWith('conv:status:bot-session-1');
      expect(msgCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'system',
            content: 'Handed back to the AI'
          })
        })
      );
      expect(res.success).toBe(true);
      expect(res.status).toBe('ai');
    });

    it('sendConversationReply creates message with role: agent and dispatches live to Telegram', async () => {
      vi.spyOn(prisma.botUserSession, 'findFirst').mockResolvedValueOnce({
        id: 'bot-session-1',
        tenantId: testTenantId,
        telegramUserId: '111',
        telegramFirstName: 'Alice'
      } as any);
      vi.spyOn(prisma.whatsAppSession, 'findFirst').mockResolvedValueOnce(null);
      vi.spyOn(prisma.webChatSession, 'findFirst').mockResolvedValueOnce(null);

      vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce({
        botToken: encrypt('dummy-bot-token')
      } as any);

      const msgSpy = vi.spyOn(prisma.telegramChatMessage, 'create').mockResolvedValueOnce({
        id: 'msg-reply-1',
        role: 'agent',
        content: 'Your order has been refilled successfully!'
      } as any);
      vi.spyOn(prisma.botUserSession, 'update').mockResolvedValueOnce({} as any);

      const sendTgSpy = vi.spyOn(TelegramBotService, 'sendMessage').mockResolvedValueOnce(true);

      const result = await tenantsService.sendConversationReply(
        testTenantId,
        'bot-session-1',
        'Your order has been refilled successfully!'
      );

      expect(msgSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'agent',
            content: 'Your order has been refilled successfully!'
          })
        })
      );
      expect(sendTgSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: '111',
          text: 'Your order has been refilled successfully!'
        })
      );
      expect(result.success).toBe(true);
      expect(result.message.from).toBe('agent');
      expect(result.message.text).toBe('Your order has been refilled successfully!');
    });
  });
});
