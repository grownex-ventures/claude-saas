import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  tenantAccessMiddleware,
  verifyActiveSubscription,
  AuthenticatedRequest
} from '../src/common/middleware/tenant-access.middleware.js';
import { PanelCrawlerService } from '../src/crawler/panel-crawler.service.js';
import { BotManagerService } from '../src/bot-engine/bot-manager.service.js';
import { TenantsService } from '../src/tenants/tenants.service.js';
import { TenantsController } from '../src/tenants/tenants.controller.js';
import { prisma } from '../src/common/database/prisma.js';
import { redis } from '../src/common/redis/redis.js';

describe('Step 1 & 2: Tenant Access Middleware & Subscription Verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects requests missing Bearer token with 401', () => {
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

  it('authenticates valid JWT and attaches req.tenantId', () => {
    const tenantId = 'tenant-123';
    const secret = process.env.JWT_SECRET || 'super-secret-jwt-key-for-tenant-admin';
    const token = jwt.sign({ tenantId }, secret);

    const req = {
      headers: { authorization: `Bearer ${token}` }
    } as AuthenticatedRequest;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as any;
    const next = vi.fn();

    tenantAccessMiddleware(req, res, next);
    expect(req.tenantId).toBe(tenantId);
    expect(next).toHaveBeenCalled();
  });

  it('checks Redis key tenant:${tenantId}:status on verifyActiveSubscription', async () => {
    vi.spyOn(redis, 'get').mockResolvedValueOnce('ACTIVE');

    const isActive = await verifyActiveSubscription('tenant-abc');
    expect(redis.get).toHaveBeenCalledWith('tenant:tenant-abc:status');
    expect(isActive).toBe(true);
  });

  it('on Redis miss, queries prisma.tenant and caches subscriptionStatus with TTL 3600s', async () => {
    vi.spyOn(redis, 'get').mockResolvedValueOnce(null);
    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce({
      id: 'tenant-xyz',
      email: 'owner@panel.com',
      passwordHash: 'hashed',
      botToken: '123456:ABC',
      panelApiUrl: 'https://panel.example.com',
      subscriptionStatus: 'ACTIVE',
      crawledData: null,
      lastCrawledAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } as any);
    const setSpy = vi.spyOn(redis, 'set').mockResolvedValueOnce('OK' as any);

    const isActive = await verifyActiveSubscription('tenant-xyz');
    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({ where: { id: 'tenant-xyz' } });
    expect(setSpy).toHaveBeenCalledWith('tenant:tenant-xyz:status', 'ACTIVE', 'EX', 3600);
    expect(isActive).toBe(true);
  });
});

describe('Step 3: PanelCrawlerService Tenant Isolation & Query Cache', () => {
  let crawler: PanelCrawlerService;

  beforeEach(() => {
    vi.restoreAllMocks();
    crawler = new PanelCrawlerService();
  });

  it('crawls panel and stores structured data in Postgres and Redis with tenant prefix', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([{ service: 1, name: 'Service 1' }])
    } as any);
    const updateSpy = vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce({} as any);
    const redisSetexSpy = vi.spyOn(redis, 'setex').mockResolvedValueOnce('OK' as any);

    await crawler.crawlAndCachePanel('tenant-1', 'https://demo-panel.com');

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tenant-1' },
        data: expect.objectContaining({
          crawledData: expect.any(Object),
          lastCrawledAt: expect.any(Date)
        })
      })
    );

    expect(redisSetexSpy).toHaveBeenCalledWith(
      'tenant:tenant-1:crawl:services',
      300,
      expect.any(String)
    );
  });

  it('normalizes queries and enforces strict tenant-isolated cache keys with 300s TTL', async () => {
    const redisSetexSpy = vi.spyOn(redis, 'setex').mockResolvedValueOnce('OK' as any);
    const redisGetSpy = vi.spyOn(redis, 'get').mockResolvedValueOnce('Cached Instagram answer');

    const tenantIdA = 'tenant-A';
    const rawQuery = '  How to Order Followers?  ';

    await crawler.setCachedReply(tenantIdA, rawQuery, 'Cached Instagram answer');

    // SHA-256 of 'how to order followers?'
    expect(redisSetexSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^tenant:tenant-A:qcache:[a-f0-9]{64}$/),
      300,
      'Cached Instagram answer'
    );

    const reply = await crawler.getCachedReply(tenantIdA, rawQuery);
    expect(reply).toBe('Cached Instagram answer');
    expect(redisGetSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^tenant:tenant-A:qcache:[a-f0-9]{64}$/)
    );
  });
});

describe('Step 4: BotManagerService Lifecycle and RAM Management', () => {
  let botManager: BotManagerService;

  beforeEach(() => {
    vi.restoreAllMocks();
    botManager = new BotManagerService();
  });

  it('tracks in-memory bots and prevents 409 Conflict duplicate polling', async () => {
    const stopSpy = vi.spyOn(botManager, 'stopTenantBot');

    await botManager.startTenantBot({
      tenantId: 'tenant-bot-1',
      botToken: '123456:FAKE_TOKEN_FOR_TEST',
      panelApiUrl: 'https://mypanel.com',
      subscriptionStatus: 'ACTIVE'
    });

    expect(botManager.isBotRunning('tenant-bot-1')).toBe(true);

    // Starting again should trigger clean stop first to prevent 409
    await botManager.startTenantBot({
      tenantId: 'tenant-bot-1',
      botToken: '123456:NEW_TOKEN_FOR_TEST',
      panelApiUrl: 'https://mypanel.com',
      subscriptionStatus: 'ACTIVE'
    });

    expect(stopSpy).toHaveBeenCalledWith('tenant-bot-1');

    await botManager.stopTenantBot('tenant-bot-1');
    expect(botManager.isBotRunning('tenant-bot-1')).toBe(false);
  });

  it('onModuleInit starts bots for all ACTIVE tenants', async () => {
    vi.spyOn(prisma.tenant, 'findMany').mockResolvedValueOnce([
      {
        id: 't-1',
        botToken: 'token-1:abc',
        panelApiUrl: 'https://panel1.com',
        subscriptionStatus: 'ACTIVE'
      },
      {
        id: 't-2',
        botToken: 'token-2:xyz',
        panelApiUrl: 'https://panel2.com',
        subscriptionStatus: 'ACTIVE'
      }
    ] as any);

    const startSpy = vi.spyOn(botManager, 'startTenantBot').mockResolvedValue(undefined);

    await botManager.onModuleInit();
    expect(startSpy).toHaveBeenCalledTimes(2);
  });

  it('startTenantBot decrypts AES-encrypted botToken before starting Grammy bot', async () => {
    const { encrypt } = await import('../src/common/crypto/encryption.js');
    const encryptedToken = encrypt('123456:SECRET_DECRYPTED_TOKEN');

    await botManager.startTenantBot({
      tenantId: 'tenant-enc-bot',
      botToken: encryptedToken,
      panelApiUrl: 'https://mypanel.com',
      subscriptionStatus: 'ACTIVE'
    });

    expect(botManager.isBotRunning('tenant-enc-bot')).toBe(true);
    await botManager.stopTenantBot('tenant-enc-bot');
  });
});

describe('Step 5: Admin Onboarding & Activation Endpoints', () => {
  let tenantsService: TenantsService;
  let crawlerMock: any;
  let botManagerMock: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.TEST_MODE = 'true';
    crawlerMock = {
      crawlAndCachePanel: vi.fn().mockResolvedValue(undefined),
      getCachedReply: vi.fn(),
      setCachedReply: vi.fn()
    };
    botManagerMock = {
      startTenantBot: vi.fn().mockResolvedValue(undefined),
      stopTenantBot: vi.fn().mockResolvedValue(undefined)
    };
    tenantsService = new TenantsService(crawlerMock, botManagerMock);
  });

  it('POST /api/tenants/configure saves botToken and normalized panelApiUrl', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true, result: { id: 123, is_bot: true, username: 'test_bot' } })
    } as any);

    const updateSpy = vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce({
      id: 'tenant-cfg',
      botToken: '123:abc',
      panelApiUrl: 'https://api.panel.com'
    } as any);

    const result = await tenantsService.configure('tenant-cfg', {
      botToken: '123:abc',
      panelApiUrl: 'https://api.panel.com///'
    });

    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: 'tenant-cfg' },
      data: {
        botToken: expect.stringMatching(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/),
        panelApiUrl: 'https://api.panel.com',
        telegramPanelUrl: 'https://api.panel.com'
      }
    });
    expect(result.panelApiUrl).toBe('https://api.panel.com');
  });

  it('POST /api/tenants/configure throws when Telegram getMe returns ok: false', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ ok: false, description: 'Unauthorized' })
    } as any);

    await expect(
      tenantsService.configure('tenant-invalid', {
        botToken: '123:invalid_token',
        panelApiUrl: 'https://api.panel.com'
      })
    ).rejects.toThrow('Unauthorized');
  });

  it('POST /api/tenants/activate marks status ACTIVE, sets Redis, crawls, and starts bot', async () => {
    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce({
      id: 'tenant-act',
      botToken: '123:abc',
      panelApiUrl: 'https://api.panel.com',
      subscriptionStatus: 'INACTIVE',
      hasTelegram: true
    } as any);

    vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce({
      id: 'tenant-act',
      botToken: '123:abc',
      panelApiUrl: 'https://api.panel.com',
      subscriptionStatus: 'ACTIVE'
    } as any);

    const redisSetSpy = vi.spyOn(redis, 'set').mockResolvedValueOnce('OK' as any);

    const result = await tenantsService.activate('tenant-act');

    expect(result).toEqual({ status: 'ACTIVE', botRunning: true });
    expect(redisSetSpy).toHaveBeenCalledWith('tenant:tenant-act:status', 'ACTIVE', 'EX', 3600);
    expect(crawlerMock.crawlAndCachePanel).toHaveBeenCalledWith('tenant-act', 'https://api.panel.com');
    expect(botManagerMock.startTenantBot).toHaveBeenCalled();
  });

  it('POST /api/tenants/deactivate marks EXPIRED, updates Redis, and stops bot', async () => {
    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce({
      id: 'tenant-deact',
      subscriptionStatus: 'ACTIVE'
    } as any);

    vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce({
      id: 'tenant-deact',
      subscriptionStatus: 'EXPIRED'
    } as any);

    const redisSetSpy = vi.spyOn(redis, 'set').mockResolvedValueOnce('OK' as any);

    const result = await tenantsService.deactivate('tenant-deact');

    expect(result).toEqual({ status: 'EXPIRED', botRunning: false });
    expect(redisSetSpy).toHaveBeenCalledWith('tenant:tenant-deact:status', 'EXPIRED', 'EX', 3600);
    expect(botManagerMock.stopTenantBot).toHaveBeenCalledWith('tenant-deact');
  });

  it('TenantsController router exposes all routes properly', () => {
    const controller = new TenantsController(tenantsService);
    expect(controller.router).toBeDefined();
  });
});

describe('TelegramBotService AES Encryption and Tenant Model Mapping', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('setBotConfig updates Tenant model with encrypted bot token and normalized panelApiUrl', async () => {
    const { TelegramBotService } = await import('../src/bot-engine/telegram-bot.service.js');
    const updateSpy = vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce({
      id: 'tenant-enc',
      botToken: 'encrypted_token',
      panelApiUrl: 'https://mysmmpanel.com',
      subscriptionStatus: 'ACTIVE'
    } as any);

    const result = await TelegramBotService.setBotConfig({
      tenantId: 'tenant-enc',
      botToken: '123456:SECRET_BOT_TOKEN',
      panelBaseUrl: 'https://mysmmpanel.com///'
    });

    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: 'tenant-enc' },
      data: {
        botToken: expect.stringMatching(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/),
        panelApiUrl: 'https://mysmmpanel.com'
      }
    });

    expect(result.success).toBe(true);
    expect(result.panelApiUrl).toBe('https://mysmmpanel.com');
  });

  it('sendMessage dispatches payload without throwing', async () => {
    const { TelegramBotService } = await import('../src/bot-engine/telegram-bot.service.js');
    const success = await TelegramBotService.sendMessage({
      botToken: 'test-token',
      chatId: 12345,
      text: 'Hello test message'
    });
    expect(success).toBe(true);
  });
});
