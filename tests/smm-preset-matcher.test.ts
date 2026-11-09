import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SmmPresetMatcher } from '../src/ai-engine/smm-preset-matcher.js';
import { SmmProviderClient } from '../src/smm-core/smm-client.js';

describe('SMM Preset Matcher Suite (Real Chat Pattern Resolvers)', () => {
  const mockTenant = {
    id: 'tenant-123',
    panelApiUrl: 'https://testpanel.com',
    widgetTitle: 'Test SMM Agency'
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Greetings & Informal Slang', () => {
    it('matches "hlo", "hlw", "hello buddy", "hey bro" with instant 0-token greeting', () => {
      const r1 = SmmPresetMatcher.matchGreeting('hlo', mockTenant);
      expect(r1.matched).toBe(true);
      expect(r1.intent).toBe('greeting');
      expect(r1.reply).toContain('Test SMM Agency');
      expect(r1.reply).toContain('Track an Order');

      const r2 = SmmPresetMatcher.matchGreeting('hello buddy', mockTenant);
      expect(r2.matched).toBe(true);

      const r3 = SmmPresetMatcher.matchGreeting('hey bro', mockTenant, 'short');
      expect(r3.matched).toBe(true);
      expect(r3.reply).toBe('👋 **Hello! Welcome to Test SMM Agency.** How can I assist you?');
    });

    it('matches conversational greetings like "how are you" and "how r u"', () => {
      const r = SmmPresetMatcher.matchGreeting('how are you', mockTenant);
      expect(r.matched).toBe(true);
      expect(r.reply).toContain("I'm doing great, thank you for asking!");
    });

    it('deduplicates panelName when widgetTitle already contains Customer Support', () => {
      const doubleTitleTenant = { ...mockTenant, widgetTitle: 'Customer Support' };
      const r = SmmPresetMatcher.matchGreeting('hello', doubleTitleTenant, 'professional');
      expect(r.matched).toBe(true);
      expect(r.reply).not.toContain('Customer Support Customer Support');
    });

    it('does not falsely match regular queries containing greetings', () => {
      const r = SmmPresetMatcher.matchGreeting('say hello to my followers on instagram for 100 likes', mockTenant);
      expect(r.matched).toBe(false);
    });
  });

  describe('1.5 Capabilities & Help Menu', () => {
    it('matches "how can you help me??" and "what can you do" with 0-token capability guide', () => {
      const r = SmmPresetMatcher.matchCapabilities('how can you help me??', mockTenant);
      expect(r.matched).toBe(true);
      expect(r.intent).toBe('capabilities');
      expect(r.reply).toContain('Check Order Status');
      expect(r.reply).toContain('Search Services & Rates');
      expect(r.reply).toContain('Account Balance');
    });
  });

  describe('2. Incomplete Order Status Prompt', () => {
    it('prompts user for Order ID when asking "i want to check order status"', () => {
      const r1 = SmmPresetMatcher.matchIncompleteOrderTracking('i want to check order status');
      expect(r1.matched).toBe(true);
      expect(r1.intent).toBe('incomplete_order_prompt');
      expect(r1.reply).toContain('Please reply with your **Order ID**');

      const r2 = SmmPresetMatcher.matchIncompleteOrderTracking('how can i check order status??');
      expect(r2.matched).toBe(true);
      expect(r2.reply).toContain('Order ID');
    });
  });

  describe('2. Free-Text Order Tracking', () => {
    it('extracts order IDs from free-text and retrieves status live', async () => {
      vi.spyOn(SmmProviderClient.prototype, 'getOrderStatus').mockResolvedValueOnce({
        status: 'Completed',
        start_count: 500,
        remains: -4200,
        charge: '1.20',
        currency: 'USD'
      });

      const res = await SmmPresetMatcher.matchOrderTracking(
        '6748424 check order status of this',
        mockTenant,
        'cat_key_123'
      );

      expect(res.matched).toBe(true);
      expect(res.intent).toBe('order_tracking');
      expect(res.reply).toContain('Order #6748424 Details');
      expect(res.reply).toContain('Completed');
      expect(res.reply).toContain('0 (Completed)');
    });

    it('handles multiple order IDs in a single message', async () => {
      vi.spyOn(SmmProviderClient.prototype, 'getOrderStatus')
        .mockResolvedValueOnce({ status: 'Completed', charge: '1.00', start_count: 100, remains: 0 })
        .mockResolvedValueOnce({ status: 'In progress', charge: '2.00', start_count: 200, remains: 50 });

      const res = await SmmPresetMatcher.matchOrderTracking(
        '6748424, 6988290 check order status of this',
        mockTenant,
        'cat_key_123'
      );

      expect(res.matched).toBe(true);
      expect(res.reply).toContain('Order #6748424 Details');
      expect(res.reply).toContain('Order #6988290 Details');
    });

    it('prompts to link account if no API key is available', async () => {
      const res = await SmmPresetMatcher.matchOrderTracking(
        'status 6748424',
        mockTenant,
        undefined,
        undefined
      );

      expect(res.matched).toBe(true);
      expect(res.reply).toContain('/setkey');
    });
  });

  describe('3. Wallet & Balance Checks', () => {
    it('returns live balance when customerApiKey is linked for /balance or "check bal"', async () => {
      vi.spyOn(SmmProviderClient.prototype, 'getBalance').mockResolvedValueOnce({
        balance: '42.50',
        currency: 'USD'
      });

      const res = await SmmPresetMatcher.matchBalance('check bal', mockTenant, 'user_key_abc');
      expect(res.matched).toBe(true);
      expect(res.intent).toBe('balance');
      expect(res.reply).toContain('$42.50 USD');
    });

    it('gracefully handles 401 unauthorized error with reconnection instructions', async () => {
      vi.spyOn(SmmProviderClient.prototype, 'getBalance').mockRejectedValueOnce(
        new Error('SMM Provider HTTP Error: 401 Unauthorized')
      );

      const res = await SmmPresetMatcher.matchBalance('my bal', mockTenant, 'invalid_key');
      expect(res.matched).toBe(true);
      expect(res.reply).toContain('unauthorized or expired');
      expect(res.reply).toContain('/setkey');
    });

    it('prompts /setkey when balance is requested without linked account', async () => {
      const res = await SmmPresetMatcher.matchBalance('my balance', mockTenant, undefined);
      expect(res.matched).toBe(true);
      expect(res.reply).toContain('/setkey <YOUR_API_KEY>');
    });
  });

  describe('4. Payment Methods', () => {
    it('returns supported gateways for payment inquiries', () => {
      const res = SmmPresetMatcher.matchPayments('how to add funds', mockTenant);
      expect(res.matched).toBe(true);
      expect(res.intent).toBe('payments');
      expect(res.reply).toContain('USDT');
      expect(res.reply).toContain('Add Funds');
    });
  });

  describe('5. Refill Inquiries', () => {
    it('returns 30-day refill policy guidance', () => {
      const res = SmmPresetMatcher.matchRefill('my followers dropped refill please', mockTenant);
      expect(res.matched).toBe(true);
      expect(res.intent).toBe('refill');
      expect(res.reply).toContain('30-Day Refill Guarantee');
    });
  });

  describe('6. Human Escalation Requests', () => {
    it('flags escalation for human support requests', () => {
      const res = SmmPresetMatcher.matchHumanEscalation('talk to human please', mockTenant);
      expect(res.matched).toBe(true);
      expect(res.intent).toBe('human_escalation');
      expect(res.escalated).toBe(true);
      expect(res.reply).toContain('Human Support Escalation');
    });
  });

  describe('7. Courtesies & Closings', () => {
    it('replies warmly to thanks and closings', () => {
      const res = SmmPresetMatcher.matchCourtesy('thanks', 'friendly');
      expect(res.matched).toBe(true);
      expect(res.intent).toBe('courtesy');
      expect(res.reply).toContain("You're very welcome");
    });
  });
});

