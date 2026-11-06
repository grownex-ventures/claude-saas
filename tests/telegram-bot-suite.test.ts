import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiAgentService } from '../src/ai-engine/ai-agent.service.js';
import { BotManagerService } from '../src/bot-engine/bot-manager.service.js';
import { prisma } from '../src/common/database/prisma.js';

describe('Telegram Bot & Multi-Tenant Support Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Competitor & Foreign SMM Panel Rejection Guardrail', () => {
    const aiService = AiAgentService.getInstance();

    it('rejects queries asking about competitor panels by domain or brand', () => {
      const panelUrl = 'https://mysmmpanel.com';
      expect(aiService.isCompetitorQuery('Is JustAnotherPanel cheaper than you?', panelUrl)).toBe(true);
      expect(aiService.isCompetitorQuery('Can you check my order on peakerr.com?', panelUrl)).toBe(true);
      expect(aiService.isCompetitorQuery('Compare your prices with another panel', panelUrl)).toBe(true);
      expect(aiService.isCompetitorQuery('Tell me about smmking services', panelUrl)).toBe(true);
      expect(aiService.isCompetitorQuery('Do you know secsers panel?', panelUrl)).toBe(true);
    });

    it('allows queries related to the current panel and its social media services', () => {
      const panelUrl = 'https://mysmmpanel.com';
      expect(aiService.isCompetitorQuery('What are your Instagram follower prices?', panelUrl)).toBe(false);
      expect(aiService.isCompetitorQuery('How do I add funds on mysmmpanel.com?', panelUrl)).toBe(false);
      expect(aiService.isCompetitorQuery('Can I track my order #12345?', panelUrl)).toBe(false);
      expect(aiService.isCompetitorQuery('What is your refund policy?', panelUrl)).toBe(false);
    });

    it('immediately returns a polite rejection message when competitor query is detected', async () => {
      vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({
        id: 'tenant-100',
        panelApiUrl: 'https://mysmmpanel.com',
        widgetTitle: 'Support',
        widgetWelcomeMessage: 'Welcome',
        widgetApiKey: null,
        crawledData: [],
        subscriptionStatus: 'ACTIVE'
      } as any);

      const reply = await aiService.generateReply({
        tenantId: 'tenant-100',
        message: 'Is justanotherpanel better for YouTube views?',
        channel: 'telegram'
      });

      expect(reply).toMatch(/dedicated AI assistant for this panel only/i);
      expect(reply).toMatch(/cannot discuss or assist with other SMM panels/i);
    });
  });

  describe('2. Live API Grounding & Place Order Tool', () => {
    const aiService = AiAgentService.getInstance();

    it('contains place_order, check_order_status, check_balance, and search_services in tools', () => {
      const tools = (aiService as any).getTools();
      const toolNames = tools.map((t: any) => t.name);
      expect(toolNames).toContain('place_order');
      expect(toolNames).toContain('check_order_status');
      expect(toolNames).toContain('check_balance');
      expect(toolNames).toContain('search_services');
    });

    it('rejects place_order if customer has not linked their panel API key', async () => {
      const result = await (aiService as any).executeTool(
        'place_order',
        { serviceId: '10', link: 'https://instagram.com/p/test', quantity: 100 },
        { id: 'tenant-1', panelApiUrl: 'https://mypanel.com' },
        [],
        undefined,
        undefined // No customer API key
      );
      expect(result).toMatch(/link your panel account first using \/setkey/i);
    });
  });

  describe('3. Multi-Tenant & Per-User Chat Persistence & Isolation', () => {
    const botManager = BotManagerService.getInstance();

    it('saves chat turns with tenantId and telegramUserId for strict isolation', async () => {
      const createSpy = vi.spyOn(prisma.telegramChatMessage, 'create').mockResolvedValue({
        id: 'msg-1',
        tenantId: 'tenant-alpha',
        telegramUserId: 'user-999',
        role: 'user',
        content: 'Hello, what is my balance?',
        createdAt: new Date()
      } as any);

      await botManager.saveChatMessage('tenant-alpha', 'user-999', 'user', 'Hello, what is my balance?');

      expect(createSpy).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-alpha',
          telegramUserId: 'user-999',
          role: 'user',
          content: 'Hello, what is my balance?'
        }
      });
    });

    it('upserts BotUserSession capturing username and first name for customer directory', async () => {
      const upsertSpy = vi.spyOn(prisma.botUserSession, 'upsert').mockResolvedValue({
        id: 'session-1',
        tenantId: 'tenant-alpha',
        telegramUserId: 'user-999',
        telegramUsername: 'cryptotrader',
        telegramFirstName: 'Alex',
        userPanelKey: null,
        createdAt: new Date(),
        updatedAt: new Date()
      } as any);

      await botManager.ensureUserSession('tenant-alpha', {
        id: 999,
        username: 'cryptotrader',
        first_name: 'Alex'
      });

      expect(upsertSpy).toHaveBeenCalledWith({
        where: {
          tenantId_telegramUserId: {
            tenantId: 'tenant-alpha',
            telegramUserId: '999'
          }
        },
        update: {
          telegramUsername: 'cryptotrader',
          telegramFirstName: 'Alex'
        },
        create: {
          tenantId: 'tenant-alpha',
          telegramUserId: '999',
          telegramUsername: 'cryptotrader',
          telegramFirstName: 'Alex'
        }
      });
    });
  });

  describe('4. Singleton Unification', () => {
    it('always returns the identical instance from new and getInstance()', () => {
      const instance1 = BotManagerService.getInstance();
      const instance2 = new BotManagerService();
      expect(instance1).toBe(instance2);
    });
  });

  describe('5. User Linked API Key Catalog Resolution & Numeric ID Lookup', () => {
    const botManager = BotManagerService.getInstance();
    const aiService = AiAgentService.getInstance();

    it('resolves tenant services using caller userApiKey when tenant catalog key is missing', async () => {
      vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({
        id: 'tenant-dynamic',
        crawledData: null,
        widgetApiKey: null
      } as any);

      // Mock SmmProviderClient.prototype.getServices
      const { SmmProviderClient } = await import('../src/smm-core/smm-client.js');
      const getServicesSpy = vi.spyOn(SmmProviderClient.prototype, 'getServices').mockResolvedValue([
        {
          service: 4343,
          name: 'Instagram Likes + Views Combo',
          type: 'Default',
          rate: '1.39',
          min: 100,
          max: 10000,
          category: 'Instagram Packages'
        }
      ]);

      const services = await (botManager as any).resolveTenantServices('tenant-dynamic', 'https://panel.com', 'user-secret-key-123');
      expect(getServicesSpy).toHaveBeenCalled();
      expect(services.length).toBe(1);
      expect(services[0].service).toBe(4343);
    });

    it('matches services by numeric service ID in search_services tool', async () => {
      const mockServices = [
        { service: 4343, name: 'Instagram Likes + Views', rate: '1.39', min: 100, max: 10000, category: 'Reels' },
        { service: 9999, name: 'YouTube Subscribers', rate: '5.00', min: 50, max: 5000, category: 'YouTube' }
      ];

      const result = await (aiService as any).executeTool(
        'search_services',
        { query: '4343' },
        { id: 'tenant-1', panelApiUrl: 'https://panel.com' },
        mockServices
      );

      expect(result).toContain('ID 4343');
      expect(result).toContain('Instagram Likes + Views');
      expect(result).not.toContain('YouTube Subscribers');
    });
  });
});
