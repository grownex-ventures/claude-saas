import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WidgetService } from '../src/widget/widget.service.js';
import { prisma } from '../src/common/database/prisma.js';
import { encrypt } from '../src/common/crypto/encryption.js';
import { SmmProviderClient } from '../src/smm-core/smm-client.js';
import { redis } from '../src/common/redis/redis.js';

describe('Public SMM Website Widget Suite', () => {
  const service = new WidgetService();
  const testTenantId = 'test-widget-tenant-uuid';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('getTenantWidgetConfig returns enabled: false for unknown or inactive tenant', async () => {
    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce(null as any);
    const cfg = await service.getTenantWidgetConfig('unknown-id');
    expect(cfg.enabled).toBe(false);
  });

  it('getTenantWidgetConfig returns public branding without leaking secret API key', async () => {
    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce({
      id: testTenantId,
      subscriptionStatus: 'ACTIVE',
      widgetTitle: 'Live SMM Help',
      widgetWelcomeMessage: 'Welcome! How can we assist?',
      widgetAccentColor: '#10b981',
      widgetEnabled: true,
      widgetApiKey: 'encrypted-secret-key-12345',
      panelApiUrl: 'https://panel.example.com/api/v2'
    } as any);

    const cfg = await service.getTenantWidgetConfig(testTenantId);
    expect(cfg.enabled).toBe(true);
    expect(cfg.title).toBe('Live SMM Help');
    expect(cfg.accent).toBe('#10b981');
    expect(cfg.hasCatalogKey).toBe(true);
    expect((cfg as any).widgetApiKey).toBeUndefined();
  });

  it('getTenantWidgetConfig falls back to YourSMMagent indigo #4f46e5 when accent is not configured', async () => {
    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce({
      id: testTenantId,
      subscriptionStatus: 'ACTIVE',
      widgetEnabled: true,
      widgetAccentColor: null,
      panelApiUrl: 'https://panel.example.com/api/v2'
    } as any);

    const cfg = await service.getTenantWidgetConfig(testTenantId);
    expect(cfg.enabled).toBe(true);
    expect(cfg.accent).toBe('#4f46e5');
  });

  it('rejects empty messages with validation error', async () => {
    await expect(service.handleChatMessage(testTenantId, 'sess_12345678', '   ')).rejects.toThrow(
      'Message cannot be empty.'
    );
  });

  it('queries live services using admin catalog key without requiring user key', async () => {
    const rawKey = 'admin_demo_catalog_key';
    const encKey = encrypt(rawKey);

    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce({
      id: testTenantId,
      subscriptionStatus: 'ACTIVE',
      widgetEnabled: true,
      widgetApiKey: encKey,
      panelApiUrl: 'https://mypanel.example.com/api/v2'
    } as any);

    vi.spyOn(prisma.webChatSession, 'upsert').mockResolvedValueOnce({} as any);
    vi.spyOn(prisma.webChatMessage, 'create').mockResolvedValue({} as any);

    vi.spyOn(SmmProviderClient.prototype, 'getServices').mockResolvedValueOnce([
      {
        service: '101',
        name: 'Instagram Followers High Quality Instant',
        type: 'Default',
        category: 'Instagram Followers',
        rate: '0.85',
        min: '50',
        max: '100000'
      },
      {
        service: '102',
        name: 'YouTube Views Monetizable',
        type: 'Default',
        category: 'YouTube Views',
        rate: '1.20',
        min: '100',
        max: '500000'
      }
    ]);

    const result = await service.handleChatMessage(testTenantId, 'sess_visitor_abc', 'Show me Instagram followers price');
    expect(result.sessionId).toBe('sess_visitor_abc');
    expect(result.reply).toContain('Instagram Followers High Quality Instant');
    expect(result.reply).toContain('$0.85');
  });

  it('tracks order status when visitor inputs an order ID', async () => {
    const rawKey = 'admin_demo_catalog_key';
    const encKey = encrypt(rawKey);

    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce({
      id: testTenantId,
      subscriptionStatus: 'ACTIVE',
      widgetEnabled: true,
      widgetApiKey: encKey,
      panelApiUrl: 'https://mypanel.example.com/api/v2'
    } as any);

    vi.spyOn(prisma.webChatSession, 'upsert').mockResolvedValueOnce({} as any);
    vi.spyOn(prisma.webChatMessage, 'create').mockResolvedValue({} as any);

    vi.spyOn(SmmProviderClient.prototype, 'getOrderStatus').mockResolvedValueOnce({
      charge: '1.70',
      start_count: '120',
      status: 'In progress',
      remains: '80',
      currency: 'USD'
    });

    const result = await service.handleChatMessage(testTenantId, 'sess_visitor_abc', 'status 99881');
    expect(result.reply).toContain('Order #99881 Details:');
    expect(result.reply).toContain('In progress');
    expect(result.reply).toContain('**Remains:** 80');
    expect(result.reply).toContain('**Charge:** 1.70 USD');
  });

  it('handles zero charge on order status without showing N/A', async () => {
    const rawKey = 'admin_demo_catalog_key';
    const encKey = encrypt(rawKey);

    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce({
      id: testTenantId,
      subscriptionStatus: 'ACTIVE',
      widgetEnabled: true,
      widgetApiKey: encKey,
      panelApiUrl: 'https://mypanel.example.com/api/v2'
    } as any);

    vi.spyOn(prisma.webChatSession, 'upsert').mockResolvedValueOnce({} as any);
    vi.spyOn(prisma.webChatMessage, 'create').mockResolvedValue({} as any);

    vi.spyOn(SmmProviderClient.prototype, 'getOrderStatus').mockResolvedValueOnce({
      charge: '0',
      start_count: 0,
      status: 'Completed',
      remains: 0,
      currency: 'USD'
    });

    const result = await service.handleChatMessage(testTenantId, 'sess_visitor_zero', 'status 10001');
    expect(result.reply).toContain('Order #10001 Details:');
    expect(result.reply).toContain('**Charge:** 0 USD');
  });

  it('retrieves ordered conversation history for a session', async () => {
    // findMany queries with orderBy: { createdAt: 'desc' }, so newest message is first in DB result
    vi.spyOn(prisma.webChatMessage, 'findMany').mockResolvedValueOnce([
      {
        id: '2',
        sessionId: 'sess_1',
        role: 'assistant',
        content: 'Hello! How can we help?',
        createdAt: new Date('2026-11-01T10:00:01Z')
      },
      {
        id: '1',
        sessionId: 'sess_1',
        role: 'user',
        content: 'Hi',
        createdAt: new Date('2026-11-01T10:00:00Z')
      }
    ] as any);

    const data = await service.getChatHistory(testTenantId, 'sess_1');
    expect(data.history).toHaveLength(2);
    expect(data.history[0].role).toBe('user');
    expect(data.history[1].role).toBe('assistant');
  });

  it('serves services from Redis cache without calling SmmProviderClient', async () => {
    const cachedServices = [
      { service: '10', name: 'Cached Instagram Likes', rate: '0.45', min: '10', max: '5000', category: 'Instagram' }
    ];

    const getSpy = vi.spyOn(redis, 'get').mockResolvedValueOnce(JSON.stringify(cachedServices));
    const liveFetchSpy = vi.spyOn(SmmProviderClient.prototype, 'getServices');

    const result = await service.getCachedServices(testTenantId, 'https://mypanel.com/api/v2', 'key123');
    expect(result).toEqual(cachedServices);
    expect(getSpy).toHaveBeenCalledWith(`tenant:${testTenantId}:catalog:services`);
    expect(liveFetchSpy).not.toHaveBeenCalled();
  });

  it('fetches live services and sets Redis cache with 300s TTL on cache miss', async () => {
    const liveServices = [
      { service: '20', name: 'Live YouTube Views', rate: '1.20', min: '100', max: '50000', category: 'YouTube' }
    ];

    vi.spyOn(redis, 'get').mockResolvedValueOnce(null);
    const setexSpy = vi.spyOn(redis, 'setex').mockResolvedValueOnce('OK' as any);
    vi.spyOn(SmmProviderClient.prototype, 'getServices').mockResolvedValueOnce(liveServices);

    const result = await service.getCachedServices(testTenantId, 'https://mypanel.com/api/v2', 'key123');
    expect(result).toEqual(liveServices);
    expect(setexSpy).toHaveBeenCalledWith(`tenant:${testTenantId}:catalog:services`, 300, JSON.stringify(liveServices));
  });

  it('deduplicates in-flight catalog fetches for the same tenant', async () => {
    const liveServices = [{ service: '30', name: 'Telegram Members', rate: '2.50' }];
    vi.spyOn(redis, 'get').mockResolvedValue(null);
    vi.spyOn(redis, 'setex').mockResolvedValue('OK' as any);

    let resolvePromise: (val: any) => void;
    const delayedFetch = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    const liveFetchSpy = vi.spyOn(SmmProviderClient.prototype, 'getServices').mockImplementationOnce(() => delayedFetch as any);

    // Call twice concurrently
    const p1 = service.getCachedServices(testTenantId, 'https://mypanel.com/api/v2', 'key123');
    const p2 = service.getCachedServices(testTenantId, 'https://mypanel.com/api/v2', 'key123');

    resolvePromise!(liveServices);
    const [res1, res2] = await Promise.all([p1, p2]);

    expect(res1).toEqual(liveServices);
    expect(res2).toEqual(liveServices);
    expect(liveFetchSpy).toHaveBeenCalledTimes(1);
  });

  it('invalidates tenant catalog cache in Redis', async () => {
    const delSpy = vi.spyOn(redis, 'del').mockResolvedValueOnce(1);
    await service.invalidateCatalogCache(testTenantId);
    expect(delSpy).toHaveBeenCalledWith(`tenant:${testTenantId}:catalog:services`);
  });
});

describe('Tenant Live Support Operator Inbox (Component 3)', () => {
  const service = new WidgetService();
  const testTenantId = 'tenant-operator-test';
  const testSessionId = 'sess-visitor-999';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('getAdminSessions groups and returns active sessions for tenant', async () => {
    const rawSessions = [
      {
        sessionId: 'sess-2',
        createdAt: new Date('2026-11-03T11:00:00Z'),
        updatedAt: new Date('2026-11-03T11:05:00Z'),
        messages: [{ content: 'Do you offer bulk discounts?' }],
        _count: { messages: 1 }
      },
      {
        sessionId: 'sess-1',
        createdAt: new Date('2026-11-03T10:00:00Z'),
        updatedAt: new Date('2026-11-03T10:02:00Z'),
        messages: [{ content: 'Your order is currently in progress.' }],
        _count: { messages: 2 }
      }
    ];

    vi.spyOn(prisma.webChatSession, 'findMany').mockResolvedValueOnce(rawSessions as any);

    const sessions = await service.getAdminSessions(testTenantId);

    expect(sessions.length).toBe(2);
    expect(sessions[0].sessionId).toBe('sess-2');
    expect(sessions[0].lastMessage).toBe('Do you offer bulk discounts?');
    expect(sessions[0].messageCount).toBe(1);

    expect(sessions[1].sessionId).toBe('sess-1');
    expect(sessions[1].lastMessage).toBe('Your order is currently in progress.');
    expect(sessions[1].messageCount).toBe(2);
  });

  it('getAdminSessionTranscript throws 404 if session does not exist for tenant', async () => {
    vi.spyOn(prisma.webChatSession, 'findUnique').mockResolvedValueOnce(null);

    await expect(service.getAdminSessionTranscript(testTenantId, 'unknown-sess')).rejects.toThrow(
      'Session not found or belongs to another tenant'
    );
  });

  it('getAdminSessionTranscript returns messages ordered chronologically', async () => {
    const sessionObj = {
      sessionId: testSessionId,
      createdAt: new Date(),
      messages: [
        { id: 'm1', role: 'user', content: 'Hello', createdAt: new Date() },
        { id: 'm2', role: 'assistant', content: 'Hi there!', createdAt: new Date() }
      ]
    };

    vi.spyOn(prisma.webChatSession, 'findUnique').mockResolvedValueOnce(sessionObj as any);

    const transcript = await service.getAdminSessionTranscript(testTenantId, testSessionId);

    expect(transcript.sessionId).toBe(testSessionId);
    expect(transcript.messages).toHaveLength(2);
    expect(transcript.messages[0].message).toBe('Hello');
  });

  it('sendAdminReply rejects empty reply message', async () => {
    await expect(service.sendAdminReply(testTenantId, testSessionId, '   ')).rejects.toThrow(
      'Reply message cannot be empty'
    );
  });

  it('sendAdminReply throws 404 if tenant has no messages for that session', async () => {
    vi.spyOn(prisma.webChatSession, 'findUnique').mockResolvedValueOnce(null);

    await expect(service.sendAdminReply(testTenantId, testSessionId, 'Hello visitor!')).rejects.toThrow(
      'Session not found or belongs to another tenant'
    );
  });

  it('sendAdminReply successfully persists assistant operator reply', async () => {
    vi.spyOn(prisma.webChatSession, 'findUnique').mockResolvedValueOnce({
      id: 'session-id-1',
      tenantId: testTenantId,
      sessionId: testSessionId
    } as any);

    vi.spyOn(prisma.webChatSession, 'update').mockResolvedValueOnce({} as any);

    const createdReply = {
      id: 'reply-msg-1',
      sessionId: testSessionId,
      role: 'assistant',
      content: 'Hello! I am a human agent assisting you now.',
      createdAt: new Date()
    };

    const createSpy = vi.spyOn(prisma.webChatMessage, 'create').mockResolvedValueOnce(createdReply as any);

    const result = await service.sendAdminReply(
      testTenantId,
      testSessionId,
      'Hello! I am a human agent assisting you now.'
    );

    expect(result.id).toBe('reply-msg-1');
    expect(result.role).toBe('assistant');
    expect(result.message).toBe('Hello! I am a human agent assisting you now.');
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionId: testSessionId,
          role: 'assistant',
          content: 'Hello! I am a human agent assisting you now.'
        })
      })
    );
  });
});
