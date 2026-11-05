import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiAgentService } from '../src/ai-engine/ai-agent.service.js';
import { PanelCrawlerService } from '../src/crawler/panel-crawler.service.js';
import { WidgetService } from '../src/widget/widget.service.js';
import { BotManagerService } from '../src/bot-engine/bot-manager.service.js';
import { WhatsAppBotManagerService } from '../src/whatsapp-engine/whatsapp-bot-manager.service.js';
import { SmmProviderClient } from '../src/smm-core/smm-client.js';
import { redis } from '../src/common/redis/redis.js';
import { prisma } from '../src/common/database/prisma.js';
import { RuntimeLogService } from '../src/common/logging/runtime-log.service.js';
import { encrypt } from '../src/common/crypto/encryption.js';

describe('Phase 7: Live Data, Query-Cache & Credential Hardening Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  describe('1. Dynamic Requests Bypass Cache & Never Cache', () => {
    const aiService = AiAgentService.getInstance();

    it('identifies dynamic queries (order status, balance, order placement) via isDynamicQuery', () => {
      // Order status variants
      expect(AiAgentService.isDynamicQuery('/status 12345')).toBe(true);
      expect(AiAgentService.isDynamicQuery('Check status for order 9876')).toBe(true);
      expect(AiAgentService.isDynamicQuery('Track order #44512')).toBe(true);
      expect(AiAgentService.isDynamicQuery('What is the status of my order?')).toBe(true);

      // Balance variants
      expect(AiAgentService.isDynamicQuery('/balance')).toBe(true);
      expect(AiAgentService.isDynamicQuery('What is my account balance?')).toBe(true);
      expect(AiAgentService.isDynamicQuery('Check my remaining funds')).toBe(true);

      // Order placement variants
      expect(AiAgentService.isDynamicQuery('/order 1000 followers')).toBe(true);
      expect(AiAgentService.isDynamicQuery('Place order for instagram followers')).toBe(true);
      expect(AiAgentService.isDynamicQuery('Order now')).toBe(true);

      // Static queries should return false
      expect(AiAgentService.isDynamicQuery('What services do you provide?')).toBe(false);
      expect(AiAgentService.isDynamicQuery('Hello')).toBe(false);
      expect(AiAgentService.isDynamicQuery('How much does YouTube views cost?')).toBe(false);
    });

    it('bypasses Redis cache read and never writes to cache for order status inquiries', async () => {
      const redisGetSpy = vi.spyOn(redis, 'get');
      const redisSetexSpy = vi.spyOn(redis, 'setex');

      vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({
        id: 'tenant-dyn-1',
        panelApiUrl: 'https://demo-panel.com',
        widgetApiKey: null,
        crawledData: [],
        subscriptionStatus: 'ACTIVE'
      } as any);

      // Mock LLM generation
      vi.spyOn((aiService as any).aiClient, 'generateCompletion').mockResolvedValue({
        content: 'Your order #12345 is currently Processing.'
      });

      const reply = await aiService.generateReply({
        tenantId: 'tenant-dyn-1',
        message: 'Where is order #12345?',
        channel: 'widget'
      });

      expect(reply).toContain('12345');
      // Must NOT check or write qcache
      expect(redisGetSpy).not.toHaveBeenCalledWith(expect.stringContaining('qcache'));
      expect(redisSetexSpy).not.toHaveBeenCalledWith(expect.stringContaining('qcache'), expect.anything(), expect.anything());
    });

    it('bypasses Redis cache read and never writes to cache for balance inquiries', async () => {
      const redisGetSpy = vi.spyOn(redis, 'get');
      const redisSetexSpy = vi.spyOn(redis, 'setex');

      vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({
        id: 'tenant-dyn-2',
        panelApiUrl: 'https://demo-panel.com',
        widgetApiKey: null,
        crawledData: [],
        subscriptionStatus: 'ACTIVE'
      } as any);

      vi.spyOn((aiService as any).aiClient, 'generateCompletion').mockResolvedValue({
        content: 'Your available balance is $45.20 USD.'
      });

      const reply = await aiService.generateReply({
        tenantId: 'tenant-dyn-2',
        message: 'What is my current balance?',
        channel: 'widget'
      });

      expect(reply).toContain('$45.20');
      expect(redisGetSpy).not.toHaveBeenCalledWith(expect.stringContaining('qcache'));
      expect(redisSetexSpy).not.toHaveBeenCalledWith(expect.stringContaining('qcache'), expect.anything(), expect.anything());
    });

    it('prevents caching when an AI dynamic tool (check_order_status, check_balance, place_order) is invoked', async () => {
      const redisSetexSpy = vi.spyOn(redis, 'setex');

      vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({
        id: 'tenant-dyn-3',
        panelApiUrl: 'https://demo-panel.com',
        widgetApiKey: encrypt('admin-cat-key'),
        crawledData: [],
        subscriptionStatus: 'ACTIVE'
      } as any);

      // LLM decides to invoke check_order_status even though user phrased it subtly
      vi.spyOn((aiService as any).aiClient, 'generateCompletion')
        .mockResolvedValueOnce({
          content: '',
          toolCalls: [
            {
              id: 'call-1',
              name: 'check_order_status',
              arguments: { orderId: '9988' }
            }
          ]
        })
        .mockResolvedValueOnce({
          content: 'Order #9988 is complete with start count 100.'
        });

      // Mock SMM client getOrderStatus
      vi.spyOn(SmmProviderClient.prototype, 'getOrderStatus').mockResolvedValue({
        status: 'Completed',
        start_count: 100,
        remains: 0
      } as any);

      const reply = await aiService.generateReply({
        tenantId: 'tenant-dyn-3',
        message: 'Can you look into 9988 for me?',
        channel: 'widget'
      });

      expect(reply).toContain('9988');
      // Even if message wasn't initially flagged by isDynamicQuery, executing check_order_status must prevent caching
      expect(redisSetexSpy).not.toHaveBeenCalledWith(expect.stringContaining('qcache'), expect.anything(), expect.anything());
    });
  });

  describe('2. Static/Catalog Query-Cache TTL Limited to 300s', () => {
    const aiService = AiAgentService.getInstance();

    it('caches static queries in AiAgentService with exactly 300 seconds TTL', async () => {
      const redisSetexSpy = vi.spyOn(redis, 'setex').mockResolvedValue('OK' as any);
      vi.spyOn(redis, 'get').mockResolvedValue(null);

      vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({
        id: 'tenant-static-1',
        panelApiUrl: 'https://demo-panel.com',
        widgetApiKey: null,
        crawledData: [{ service: '1', name: 'Instagram Followers', category: 'Instagram', rate: '1.20', min: '10', max: '1000' }],
        subscriptionStatus: 'ACTIVE'
      } as any);

      vi.spyOn((aiService as any).aiClient, 'generateCompletion').mockResolvedValue({
        content: 'We offer Instagram Followers for $1.20 per 1k.'
      });

      const reply = await aiService.generateReply({
        tenantId: 'tenant-static-1',
        message: 'What are your Instagram follower prices?',
        channel: 'widget'
      });

      expect(reply).toContain('Instagram Followers');
      expect(redisSetexSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^tenant:tenant-static-1:qcache:[a-f0-9]{64}$/),
        300,
        expect.any(String)
      );
    });

    it('PanelCrawlerService limits static query cache and crawled catalog TTL to 300 seconds', async () => {
      const redisSetexSpy = vi.spyOn(redis, 'setex').mockResolvedValue('OK' as any);

      // 1. Static reply cache
      await PanelCrawlerService.setCachedReply('tenant-crawl-1', 'What are your support hours?', '24/7 online support');
      expect(redisSetexSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^tenant:tenant-crawl-1:qcache:[a-f0-9]{64}$/),
        300,
        '24/7 online support'
      );

      // 2. Dynamic queries in PanelCrawlerService are skipped
      redisSetexSpy.mockClear();
      await PanelCrawlerService.setCachedReply('tenant-crawl-1', 'Order status #12345', 'Pending');
      expect(redisSetexSpy).not.toHaveBeenCalled();

      // 3. Dynamic queries in PanelCrawlerService getCachedReply bypass cache
      const getSpy = vi.spyOn(redis, 'get');
      const dynamicCached = await PanelCrawlerService.getCachedReply('tenant-crawl-1', 'What is my balance?');
      expect(dynamicCached).toBeNull();
      expect(getSpy).not.toHaveBeenCalled();
    });

    it('WidgetService.getCachedServices caches catalog in Redis with 300 seconds TTL', async () => {
      const widgetService = new WidgetService();
      vi.spyOn(redis, 'get').mockResolvedValue(null);
      const redisSetexSpy = vi.spyOn(redis, 'setex').mockResolvedValue('OK' as any);

      vi.spyOn(SmmProviderClient.prototype, 'getServices').mockResolvedValue([
        { service: '101', name: 'YouTube Views', rate: '2.50', min: '100', max: '50000', category: 'YouTube' }
      ]);

      const services = await widgetService.getCachedServices('tenant-widget-1', 'https://mypanel.com', 'test-key');
      expect(services).toHaveLength(1);
      expect(redisSetexSpy).toHaveBeenCalledWith(
        'tenant:tenant-widget-1:catalog:services',
        300,
        expect.any(String)
      );
    });
  });

  describe('3. Telegram /balance GET Replacement & POST-Only SMM Keys', () => {
    it('SmmProviderClient transmits API keys exclusively via POST body, never in URL or query params', async () => {
      const client = new SmmProviderClient('https://smm-upstream.com', 'secret-api-key-xyz-999');

      let capturedUrl = '';
      let capturedMethod = '';
      let capturedBody = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
        capturedUrl = String(url);
        capturedMethod = opts?.method;
        capturedBody = String(opts?.body || '');
        return {
          ok: true,
          text: async () => JSON.stringify({ balance: '250.75', currency: 'USD' })
        };
      });

      const balance = await client.getBalance();

      expect(balance.balance).toBe('250.75');
      expect(balance.currency).toBe('USD');

      // 1. URL must NOT contain the API key or query parameters
      expect(capturedUrl).not.toContain('secret-api-key-xyz-999');
      expect(capturedUrl).not.toContain('?key=');
      expect(capturedUrl).toBe('https://smm-upstream.com/api/v2');

      // 2. Request method must be POST
      expect(capturedMethod).toBe('POST');

      // 3. Body contains key in form-urlencoded body
      expect(capturedBody).toContain('key=secret-api-key-xyz-999');
      expect(capturedBody).toContain('action=balance');
    });

    it('Telegram /balance command uses SmmProviderClient.getBalance() and never logs API keys', async () => {
      const botManager = BotManagerService.getInstance();
      const rawUserKey = 'customer-smm-panel-key-777';
      const encryptedKey = encrypt(rawUserKey);

      vi.spyOn(prisma.botUserSession, 'findUnique').mockResolvedValue({
        tenantId: 'tenant-tg-1',
        telegramUserId: '12345',
        userPanelKey: encryptedKey
      } as any);

      vi.spyOn(prisma.botUserSession, 'upsert').mockResolvedValue({} as any);
      vi.spyOn(prisma.telegramChatMessage, 'create').mockResolvedValue({} as any);

      const getBalanceSpy = vi.spyOn(SmmProviderClient.prototype, 'getBalance').mockResolvedValue({
        balance: '120.00',
        currency: 'USD'
      });

      const logSpy = vi.spyOn(RuntimeLogService, 'record').mockResolvedValue({} as any);

      const bot = botManager.buildBot('tenant-tg-1', '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11', 'https://panel.example.com');
      bot.botInfo = {
        id: 12345,
        is_bot: true,
        first_name: 'TestBot',
        username: 'test_bot',
        can_join_groups: true,
        can_read_all_group_messages: false,
        supports_inline_queries: false
      } as any;

      const sentTelegrams: any[] = [];
      bot.api.config.use((_prev, method, payload) => {
        sentTelegrams.push({ method, payload });
        return Promise.resolve({ ok: true, result: { message_id: 1, text: (payload as any)?.text } } as any);
      });

      await bot.handleUpdate({
        update_id: 10001,
        message: {
          message_id: 1,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 12345, type: 'private' },
          from: { id: 12345, is_bot: false, first_name: 'Test', username: 'testuser' },
          text: '/balance',
          entities: [{ type: 'bot_command', offset: 0, length: 8 }]
        } as any
      });

      expect(getBalanceSpy).toHaveBeenCalled();
      expect(sentTelegrams.some((m) => m.method === 'sendMessage' && m.payload.text?.includes('120.00 USD'))).toBe(true);

      // Ensure API key was NEVER included in runtime log messages or details
      for (const call of logSpy.mock.calls) {
        const payload = JSON.stringify(call[0]);
        expect(payload).not.toContain(rawUserKey);
      }
    });
  });

  describe('4. Corrupted Encrypted Keys Fail Safely', () => {
    it('Telegram /balance command fails safely and prompts user to reconnect when encrypted key is corrupted', async () => {
      const botManager = BotManagerService.getInstance();

      // Corrupted key string that will throw during AES-256 decryption
      const corruptedKey = 'invalid-hex:malformed:ciphertext';

      vi.spyOn(prisma.botUserSession, 'findUnique').mockResolvedValue({
        tenantId: 'tenant-corrupt-1',
        telegramUserId: '999',
        userPanelKey: corruptedKey
      } as any);

      vi.spyOn(prisma.botUserSession, 'upsert').mockResolvedValue({} as any);
      vi.spyOn(prisma.telegramChatMessage, 'create').mockResolvedValue({} as any);

      const smmClientSpy = vi.spyOn(SmmProviderClient.prototype, 'getBalance');

      const bot = botManager.buildBot('tenant-corrupt-1', '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11', 'https://panel.example.com');
      bot.botInfo = {
        id: 999,
        is_bot: true,
        first_name: 'CorruptBot',
        username: 'corrupt_bot',
        can_join_groups: true,
        can_read_all_group_messages: false,
        supports_inline_queries: false
      } as any;

      const sentTelegrams: any[] = [];
      bot.api.config.use((_prev, method, payload) => {
        sentTelegrams.push({ method, payload });
        return Promise.resolve({ ok: true, result: { message_id: 1, text: (payload as any)?.text } } as any);
      });

      await bot.handleUpdate({
        update_id: 10002,
        message: {
          message_id: 1,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 999, type: 'private' },
          from: { id: 999, is_bot: false, first_name: 'Corrupt', username: 'corruptuser' },
          text: '/balance',
          entities: [{ type: 'bot_command', offset: 0, length: 8 }]
        } as any
      });

      // Must prompt user to reconnect with /setkey
      expect(sentTelegrams.some((m) => m.method === 'sendMessage' && /could not be decrypted.*\/setkey/i.test(m.payload.text))).toBe(true);
      // Must NOT attempt to call upstream SMM panel with corrupted ciphertext
      expect(smmClientSpy).not.toHaveBeenCalled();
    });

    it('WhatsApp bot fails safely and prompts user to reconnect when encrypted key is corrupted', async () => {
      const waManager = WhatsAppBotManagerService.getInstance();
      const corruptedKey = 'deadbeef:cafebabe:invalidcipher';

      vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({
        id: 'tenant-wa-corrupt',
        panelApiUrl: 'https://mypanel.com',
        hasWhatsapp: true,
        subscriptionStatus: 'ACTIVE'
      } as any);

      vi.spyOn(prisma.whatsAppSession, 'upsert').mockResolvedValue({
        id: 'wa-session-1',
        tenantId: 'tenant-wa-corrupt',
        whatsappJid: '1234567890@s.whatsapp.net',
        userPanelKey: corruptedKey
      } as any);

      vi.spyOn(prisma.whatsAppChatMessage, 'create').mockResolvedValue({} as any);
      const smmClientSpy = vi.spyOn(SmmProviderClient.prototype, 'getBalance');

      let sentText = '';
      const mockWhatsAppService = {
        sendReply: vi.fn().mockImplementation(async (_jid: string, text: string) => {
          sentText = text;
        }),
        sendMessage: vi.fn(),
        deleteMessage: vi.fn()
      };

      await (waManager as any).handleIncomingMessage(
        'tenant-wa-corrupt',
        {} as any,
        {
          key: { id: 'msg-1', remoteJid: '1234567890@s.whatsapp.net', fromMe: false },
          message: { conversation: '/balance' }
        },
        mockWhatsAppService
      );

      expect(sentText).toMatch(/could not be decrypted.*\/setkey/i);
      expect(smmClientSpy).not.toHaveBeenCalled();
    });

    it('AiAgentService fails safely and returns reconnect message when customer key is corrupted', async () => {
      const aiService = AiAgentService.getInstance();
      const corruptedKey = 'garbage:corrupt:key';

      vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({
        id: 'tenant-ai-corrupt',
        panelApiUrl: 'https://mypanel.com',
        widgetApiKey: null,
        crawledData: [],
        subscriptionStatus: 'ACTIVE'
      } as any);

      vi.spyOn(prisma.botUserSession, 'findUnique').mockResolvedValue({
        tenantId: 'tenant-ai-corrupt',
        telegramUserId: 'user-777',
        userPanelKey: corruptedKey
      } as any);

      // LLM attempts to call check_balance tool
      vi.spyOn((aiService as any).aiClient, 'generateCompletion').mockResolvedValue({
        content: '',
        toolCalls: [
          {
            id: 'call-bal-1',
            name: 'check_balance',
            arguments: {}
          }
        ]
      });

      const smmClientSpy = vi.spyOn(SmmProviderClient.prototype, 'getBalance');

      const toolResult = await (aiService as any).executeTool(
        'check_balance',
        {},
        { panelApiUrl: 'https://mypanel.com' },
        [],
        undefined,
        undefined,
        true // customerKeyCorrupted
      );

      expect(toolResult).toMatch(/could not be decrypted.*\/setkey/i);
      expect(smmClientSpy).not.toHaveBeenCalled();
    });
  });
});
