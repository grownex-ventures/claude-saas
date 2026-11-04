import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractMessageText,
  cleanJid,
  WhatsAppBotManagerService
} from '../src/whatsapp-engine/whatsapp-bot-manager.service.js';
import { WhatsAppService } from '../src/whatsapp-engine/whatsapp.service.js';
import { prisma } from '../src/common/database/prisma.js';

describe('WhatsApp Engine & Manager Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('correctly extracts plain text from different message envelope variants', () => {
    expect(extractMessageText({ conversation: 'Hello world' })).toBe('Hello world');
    expect(extractMessageText({ extendedTextMessage: { text: 'Extended message' } } as any)).toBe('Extended message');
    expect(extractMessageText({ imageMessage: { caption: 'Caption text' } } as any)).toBe('Caption text');
    expect(extractMessageText(null)).toBe('');
  });

  it('normalizes JID by removing multi-device suffixes', () => {
    expect(cleanJid('919876543210:1@s.whatsapp.net')).toBe('919876543210@s.whatsapp.net');
    expect(cleanJid('919876543210@s.whatsapp.net')).toBe('919876543210@s.whatsapp.net');
    expect(cleanJid('')).toBe('');
  });

  it('creates isolated auth directories per tenant', () => {
    const service1 = new WhatsAppService({ tenantId: 'tenant-1' });
    const service2 = new WhatsAppService({ tenantId: 'tenant-2' });

    expect((service1 as any).authDir).toContain('tenant-1');
    expect((service2 as any).authDir).toContain('tenant-2');
    expect((service1 as any).authDir).not.toBe((service2 as any).authDir);
  });

  it('handles message incoming dispatch with /help reply', async () => {
    const manager = new WhatsAppBotManagerService();
    const mockService = {
      sendReply: vi.fn().mockResolvedValue(undefined),
      deleteMessage: vi.fn().mockResolvedValue(undefined)
    } as any;

    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce({
      id: 'tenant-wa-1',
      panelApiUrl: 'https://panel.example.com',
      hasWhatsapp: true
    } as any);

    vi.spyOn(prisma.whatsAppSession, 'upsert').mockResolvedValueOnce({} as any);
    vi.spyOn(prisma.whatsAppChatMessage, 'create').mockResolvedValue({} as any);

    const msg: any = {
      key: { remoteJid: '919876543210:2@s.whatsapp.net' },
      message: { conversation: '/help' }
    };

    await (manager as any).handleIncomingMessage('tenant-wa-1', {} as any, msg, mockService);

    expect(mockService.sendReply).toHaveBeenCalledWith(
      '919876543210@s.whatsapp.net',
      expect.stringContaining('WhatsApp Support Commands')
    );
  });

  it('deletes raw API key message for privacy and encrypts session on /setkey', async () => {
    const manager = new WhatsAppBotManagerService();
    const mockService = {
      sendReply: vi.fn().mockResolvedValue(undefined),
      deleteMessage: vi.fn().mockResolvedValue(undefined)
    } as any;

    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce({
      id: 'tenant-wa-2',
      panelApiUrl: 'https://mypanel.com',
      hasWhatsapp: true
    } as any);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({ balance: '50.00', currency: 'USD' }))
    } as any);

    const upsertSpy = vi.spyOn(prisma.whatsAppSession, 'upsert').mockResolvedValueOnce({} as any);
    const updateSpy = vi.spyOn(prisma.whatsAppSession, 'update').mockResolvedValueOnce({} as any);
    vi.spyOn(prisma.whatsAppChatMessage, 'create').mockResolvedValue({} as any);

    const msg: any = {
      key: { remoteJid: '919876543210@s.whatsapp.net', id: 'msg-key-id' },
      message: { conversation: '/setkey 0123456789abcdef0123456789abcdef' }
    };

    await (manager as any).handleIncomingMessage('tenant-wa-2', {} as any, msg, mockService);

    expect(mockService.deleteMessage).toHaveBeenCalledWith('919876543210@s.whatsapp.net', msg.key);
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_whatsappJid: {
            tenantId: 'tenant-wa-2',
            whatsappJid: '919876543210@s.whatsapp.net'
          }
        }
      })
    );
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_whatsappJid: {
            tenantId: 'tenant-wa-2',
            whatsappJid: '919876543210@s.whatsapp.net'
          }
        }
      })
    );
    expect(mockService.sendReply).toHaveBeenCalledWith(
      '919876543210@s.whatsapp.net',
      expect.stringContaining('Account Connected Successfully')
    );
  });

  it('rejects WhatsApp incoming messages when tenant plan has hasWhatsapp === false', async () => {
    const manager = new WhatsAppBotManagerService();
    const mockService = {
      sendReply: vi.fn().mockResolvedValue(undefined)
    } as any;

    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce({
      id: 'tenant-wa-locked',
      panelApiUrl: 'https://panel.example.com',
      hasWhatsapp: false
    } as any);

    const msg: any = {
      key: { remoteJid: '919876543210@s.whatsapp.net' },
      message: { conversation: 'Hello, what services do you have?' }
    };

    await (manager as any).handleIncomingMessage('tenant-wa-locked', {} as any, msg, mockService);

    expect(mockService.sendReply).toHaveBeenCalledWith(
      '919876543210@s.whatsapp.net',
      expect.stringContaining('WhatsApp support line is currently inactive')
    );
  });

  it('persists customer turns and passes multi-turn conversation history to AI agent', async () => {
    const manager = new WhatsAppBotManagerService();
    const mockService = {
      sendReply: vi.fn().mockResolvedValue(undefined)
    } as any;

    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce({
      id: 'tenant-wa-ai',
      whatsappPanelUrl: 'https://wa-panel.com',
      hasWhatsapp: true
    } as any);

    vi.spyOn(prisma.whatsAppSession, 'upsert').mockResolvedValueOnce({} as any);
    const msgCreateSpy = vi.spyOn(prisma.whatsAppChatMessage, 'create').mockResolvedValue({} as any);
    vi.spyOn(prisma.whatsAppChatMessage, 'findMany').mockResolvedValueOnce([
      { role: 'user', content: 'What is the price of Instagram followers?' },
      { role: 'assistant', content: 'Instagram followers start at $1.20 per 1k.' }
    ] as any);

    const { AiAgentService } = await import('../src/ai-engine/ai-agent.service.js');
    const aiSpy = vi.spyOn(AiAgentService.getInstance(), 'generateReply').mockResolvedValueOnce('They are high quality and start instantly!');

    const msg: any = {
      key: { remoteJid: '9199998888@s.whatsapp.net' },
      message: { conversation: 'Are they high quality?' }
    };

    await (manager as any).handleIncomingMessage('tenant-wa-ai', {} as any, msg, mockService);

    // 1. Verifies customer message was persisted
    expect(msgCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-wa-ai',
          whatsappJid: '9199998888@s.whatsapp.net',
          role: 'user',
          content: 'Are they high quality?'
        })
      })
    );

    // 2. Verifies AI was invoked with historical conversation turns
    expect(aiSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-wa-ai',
        channel: 'whatsapp',
        userId: '9199998888@s.whatsapp.net',
        history: [
          { role: 'assistant', content: 'Instagram followers start at $1.20 per 1k.' },
          { role: 'user', content: 'What is the price of Instagram followers?' }
        ]
      })
    );

    // 3. Verifies assistant response was recorded and sent back
    expect(msgCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-wa-ai',
          whatsappJid: '9199998888@s.whatsapp.net',
          role: 'assistant',
          content: 'They are high quality and start instantly!'
        })
      })
    );
    expect(mockService.sendReply).toHaveBeenCalledWith(
      '9199998888@s.whatsapp.net',
      'They are high quality and start instantly!'
    );
  });
});
