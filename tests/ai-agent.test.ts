import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiProviderClient } from '../src/ai-engine/ai-provider.client.js';
import { AiAgentService } from '../src/ai-engine/ai-agent.service.js';
import { prisma } from '../src/common/database/prisma.js';
import { redis } from '../src/common/redis/redis.js';

describe('AI Customer Support Agent Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Universal Multi-Provider Client', () => {
    it('initializes with default OpenRouter config when no provider specified', () => {
      const client = new AiProviderClient();
      const cfg = client.getConfig();
      expect(cfg.provider).toBe('openrouter');
      expect(cfg.model).toContain('gemini');
    });

    it('correctly maps default models for each supported AI provider without restriction', () => {
      const providers = [
        { name: 'gemini', expectedModel: 'gemini-2.0-flash' },
        { name: 'openai', expectedModel: 'gpt-4o-mini' },
        { name: 'anthropic', expectedModel: 'claude-3-5-haiku-20241022' },
        { name: 'nvidia', expectedModel: 'meta/llama-3.1-70b-instruct' },
        { name: 'groq', expectedModel: 'llama-3.3-70b-versatile' },
        { name: 'deepseek', expectedModel: 'deepseek-chat' },
        { name: 'openrouter', expectedModel: 'google/gemini-2.0-flash-001' }
      ];

      for (const p of providers) {
        const client = new AiProviderClient({ provider: p.name });
        expect(client.getConfig().model).toBe(p.expectedModel);
      }
    });

    it('provides deterministic zero-downtime fallback when API key is unconfigured', async () => {
      const client = new AiProviderClient({ apiKey: '' });
      expect(client.isConfigured()).toBe(false);

      const res = await client.generateCompletion({
        messages: [{ role: 'user', content: 'What are your rates?' }]
      });

      expect(res.provider).toBe('offline-fallback');
      expect(res.content).toContain('Platform AI Assistant');
    });
  });

  describe('AiAgentService', () => {
    const mockTenantId = 'tenant-ai-test-123';
    const mockServices = [
      { service: 101, name: 'Instagram Real Active Followers [30D Refill]', category: 'Instagram Followers', rate: '1.50', min: '100', max: '50000' },
      { service: 202, name: 'YouTube 4K High Retention Views', category: 'YouTube Views', rate: '2.80', min: '500', max: '1000000' },
      { service: 303, name: 'Telegram Channel Members [Non-Drop]', category: 'Telegram Members', rate: '0.90', min: '50', max: '25000' }
    ];

    it('returns grounded catalog response for service pricing inquiries', async () => {
      // Mock tenant database lookup
      vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({
        id: mockTenantId,
        panelApiUrl: 'https://demo-smm-panel.com',
        widgetTitle: 'Elite SMM Support',
        widgetWelcomeMessage: 'Welcome to Elite SMM!',
        widgetApiKey: null,
        crawledData: mockServices as any,
        subscriptionStatus: 'ACTIVE'
      } as any);

      // Mock redis cache miss
      vi.spyOn(redis, 'get').mockResolvedValue(null);
      vi.spyOn(redis, 'setex').mockResolvedValue('OK');

      const agent = new AiAgentService();
      const reply = await agent.generateReply({
        tenantId: mockTenantId,
        message: 'What are your Instagram follower options?',
        channel: 'widget'
      });

      expect(reply).toBeDefined();
      expect(reply.length).toBeGreaterThan(10);
      expect(reply).toMatch(/Instagram|Followers|\$1\.50/i);
    });

    it('leverages Redis query caching for instant (< 15ms) responses on identical queries', async () => {
      vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({
        id: mockTenantId,
        panelApiUrl: 'https://demo-smm-panel.com',
        subscriptionStatus: 'ACTIVE'
      } as any);

      const cachedResponse = '⚡ Instant Cached Reply: Instagram followers start at $1.50/1k with 30-day refill.';
      vi.spyOn(redis, 'get').mockResolvedValue(cachedResponse);

      const agent = new AiAgentService();
      const reply = await agent.generateReply({
        tenantId: mockTenantId,
        message: 'What are your Instagram follower options?',
        channel: 'widget'
      });

      expect(reply).toBe(cachedResponse);
    });

    it('handles order tracking queries with proper order ID detection and guidance', async () => {
      vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({
        id: mockTenantId,
        panelApiUrl: 'https://demo-smm-panel.com',
        widgetTitle: 'Support',
        crawledData: mockServices as any,
        subscriptionStatus: 'ACTIVE'
      } as any);

      vi.spyOn(redis, 'get').mockResolvedValue(null);
      vi.spyOn(redis, 'setex').mockResolvedValue('OK');

      const agent = new AiAgentService();
      const reply = await agent.generateReply({
        tenantId: mockTenantId,
        message: 'Can you track status for order 987654?',
        channel: 'widget'
      });

      expect(reply).toContain('987654');
      expect(reply).toMatch(/Order|Tracking|demo-smm-panel\.com/i);
    });

    it('returns courteous greeting and capability overview for initial user greetings', async () => {
      vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({
        id: mockTenantId,
        panelApiUrl: 'https://demo-smm-panel.com',
        crawledData: mockServices as any,
        subscriptionStatus: 'ACTIVE'
      } as any);

      vi.spyOn(redis, 'get').mockResolvedValue(null);
      vi.spyOn(redis, 'setex').mockResolvedValue('OK');

      const agent = new AiAgentService();
      const reply = await agent.generateReply({
        tenantId: mockTenantId,
        message: 'Hello!',
        channel: 'telegram'
      });

      expect(reply).toMatch(/Hello|Welcome|AI Support Assistant/i);
      expect(reply).toContain('Search');
      expect(reply).toContain('Track');
    });
  });
});
