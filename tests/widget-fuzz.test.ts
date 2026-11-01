import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WidgetController } from '../src/widget/widget.controller.js';
import { WidgetService } from '../src/widget/widget.service.js';

describe('Item 19: Widget Chat Fuzz & Robustness Tests (/api/widget/chat)', () => {
  let widgetServiceMock: any;
  let controller: WidgetController;

  beforeEach(() => {
    vi.restoreAllMocks();
    widgetServiceMock = {
      getTenantWidgetConfig: vi.fn(),
      getCachedServices: vi.fn().mockResolvedValue([]),
      handleChatMessage: vi.fn().mockImplementation(async (tenantId: string, sessionId: string, message: string) => {
        return {
          reply: `Received: ${message.slice(0, 50)}`,
          sessionId
        };
      }),
      getChatHistory: vi.fn().mockResolvedValue([])
    };
    controller = new WidgetController(widgetServiceMock as any);
  });

  function createMockReqRes(body: any) {
    const req = {
      body,
      ip: '127.0.0.1',
      params: {},
      query: {},
      headers: {}
    } as any;

    const res = {
      statusCode: 200,
      jsonData: null as any,
      status: vi.fn().mockImplementation((code: number) => {
        res.statusCode = code;
        return res;
      }),
      json: vi.fn().mockImplementation((data: any) => {
        res.jsonData = data;
        return res;
      }),
      setHeader: vi.fn().mockReturnThis(),
      sendStatus: vi.fn().mockReturnThis()
    } as any;

    return { req, res };
  }

  async function executeChatHandler(req: any, res: any) {
    const chatRoute = (controller.router.stack as any[]).find((layer: any) => layer.route?.path === '/chat');
    const handler = chatRoute?.route?.stack?.[chatRoute.route.stack.length - 1]?.handle;
    if (!handler) throw new Error('Chat handler not found');
    await handler(req, res, () => {});
  }

  // 1. SQL Injection strings
  const sqliPayloads = [
    "' OR '1'='1",
    "'; DROP TABLE \"Tenant\"; --",
    "' UNION SELECT id, email, passwordHash FROM \"Tenant\" --",
    "admin'--",
    "1' OR 1=1 #",
    "'; EXEC xp_cmdshell('dir'); --",
    "' OR EXISTS(SELECT * FROM \"AuditLog\") --"
  ];

  sqliPayloads.forEach((payload, index) => {
    it(`handles SQL injection payload #${index + 1} safely without crashing or throwing 5xx`, async () => {
      const { req, res } = createMockReqRes({
        tenantId: 'tenant-test-sqli',
        sessionId: 'session-valid-12345',
        message: payload
      });

      await executeChatHandler(req, res);

      // Must be 200 (processed safely as text) or 4xx, NEVER 5xx
      expect(res.statusCode).toBeLessThan(500);
      expect(res.statusCode).toBeGreaterThanOrEqual(200);
      if (res.statusCode === 200) {
        expect(res.jsonData.reply).toBeDefined();
      }
    });
  });

  // 2. Unicode, Emojis, RTL and multi-byte strings
  const unicodePayloads = [
    '🚀 Hello World! 🌍 🎉 👨‍👩‍👧‍👦',
    'こんにちは世界 (Japanese)',
    'مرحبا بالعالم (Arabic RTL)',
    'नमस्ते दुनिया (Hindi Devanagari)',
    'Привет мир (Cyrillic)',
    '🔥'.repeat(100),
    'Z̸a̸l̸g̸o̸ ̸t̸e̸x̸t̸ ̸c̸o̸r̸r̸u̸p̸t̸i̸o̸n̸'
  ];

  unicodePayloads.forEach((payload, index) => {
    it(`handles Unicode/Emoji payload #${index + 1} with 200 response and no corruption`, async () => {
      const { req, res } = createMockReqRes({
        tenantId: 'tenant-unicode',
        sessionId: 'session-unicode-12345',
        message: payload
      });

      await executeChatHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.reply).toBeDefined();
    });
  });

  // 3. Null bytes injection
  const nullBytePayloads = [
    { tenantId: 'tenant\0id', sessionId: 'session-12345678', message: 'Hello' },
    { tenantId: 'tenant-id', sessionId: 'session\0nullbyte', message: 'Hello' },
    { tenantId: 'tenant-id', sessionId: 'session-12345678', message: 'Hello\0World' },
    { tenantId: 'tenant-id', sessionId: 'session-12345678', message: '\x00\x00\x00' }
  ];

  nullBytePayloads.forEach((payload, index) => {
    it(`rejects null byte attack #${index + 1} with 400 Bad Request`, async () => {
      const { req, res } = createMockReqRes(payload);

      await executeChatHandler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toMatch(/null bytes/i);
    });
  });

  // 4. Oversized payloads (>4096 chars)
  it('rejects oversized message payload with 400 Bad Request', async () => {
    const hugeMessage = 'A'.repeat(5000);
    const { req, res } = createMockReqRes({
      tenantId: 'tenant-oversized',
      sessionId: 'session-oversized-123',
      message: hugeMessage
    });

    await executeChatHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toMatch(/too large/i);
  });

  // 5. Malformed types & missing fields
  it('rejects missing or invalid tenantId with 400', async () => {
    const { req, res } = createMockReqRes({
      tenantId: 12345, // invalid type
      sessionId: 'session-valid-123',
      message: 'Hello'
    });

    await executeChatHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toMatch(/tenantId/i);
  });

  it('rejects short sessionId with 400', async () => {
    const { req, res } = createMockReqRes({
      tenantId: 'tenant-123',
      sessionId: 'short', // under 8 characters
      message: 'Hello'
    });

    await executeChatHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toMatch(/sessionId/i);
  });

  it('rejects empty or whitespace-only message with 400', async () => {
    const { req, res } = createMockReqRes({
      tenantId: 'tenant-123',
      sessionId: 'session-valid-123',
      message: '    '
    });

    await executeChatHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toMatch(/message/i);
  });
});
