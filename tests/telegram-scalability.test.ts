import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BotManagerService } from '../src/bot-engine/bot-manager.service.js';
import { redis } from '../src/common/redis/redis.js';

describe('Telegram Scalability & Multi-Instance Architecture (ARC-02)', () => {
  let botManager: BotManagerService;

  beforeEach(() => {
    vi.restoreAllMocks();
    botManager = new BotManagerService();
  });

  describe('Webhook Mode', () => {
    it('rejects webhook updates with missing secret token header', async () => {
      const result = await botManager.handleWebhookUpdate('tenant-1', undefined, { update_id: 123 });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Missing webhook secret token/);
    });

    it('rejects webhook updates with incorrect secret token in constant time', async () => {
      const result = await botManager.handleWebhookUpdate('tenant-1', 'bad-secret-token-value', { update_id: 123 });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Unauthorized/);
    });

    it('accepts webhook update when valid secret_token header is provided', async () => {
      const validSecret = botManager.getSecretToken('tenant-1');
      const fakeBot: any = {
        handleUpdate: vi.fn().mockResolvedValue(undefined)
      };
      (botManager as any).activeBots.set('tenant-1', fakeBot);

      const result = await botManager.handleWebhookUpdate('tenant-1', validSecret, { update_id: 123 });
      expect(result.success).toBe(true);
      expect(fakeBot.handleUpdate).toHaveBeenCalledWith({ update_id: 123 });
    });
  });

  describe('Polling Multi-Instance Distributed Lock', () => {
    it('acquires Redis lock and starts polling when lock is available', async () => {
      vi.spyOn(redis, 'set').mockResolvedValue('OK');
      const bot = botManager.buildBot('tenant-1', '123456:BOT_TOKEN', 'https://mypanel.com');
      vi.spyOn(bot, 'start').mockReturnValue(new Promise(() => {}) as any);
      vi.spyOn(botManager, 'buildBot').mockReturnValue(bot);

      await botManager.startPolling('tenant-1', '123456:BOT_TOKEN', 'https://mypanel.com');

      expect(botManager.isBotRunning('tenant-1')).toBe(true);
      expect(redis.set).toHaveBeenCalledWith(
        'lock:telegram:poll:tenant-1',
        expect.any(String),
        'EX',
        30,
        'NX'
      );

      await botManager.stopTenantBot('tenant-1');
      expect(botManager.isBotRunning('tenant-1')).toBe(false);
    });

    it('enters standby when Redis lock is already held by another cluster instance', async () => {
      vi.spyOn(redis, 'set').mockResolvedValue(null as any); // Lock held by peer instance
      const bot = botManager.buildBot('tenant-2', '123456:BOT_TOKEN', 'https://mypanel.com');
      const startSpy = vi.spyOn(bot, 'start');
      vi.spyOn(botManager, 'buildBot').mockReturnValue(bot);

      await botManager.startPolling('tenant-2', '123456:BOT_TOKEN', 'https://mypanel.com');

      expect(botManager.isBotRunning('tenant-2')).toBe(false);
      expect(startSpy).not.toHaveBeenCalled();

      await botManager.stopTenantBot('tenant-2');
    });

    it('handles 409 Conflict gracefully by stopping duplicate polling', async () => {
      vi.spyOn(redis, 'set').mockResolvedValue('OK');
      const stopSpy = vi.spyOn(botManager, 'stopTenantBot');

      const bot = botManager.buildBot('tenant-conflict', '123456:BOT_TOKEN', 'https://mypanel.com');
      vi.spyOn(botManager, 'buildBot').mockReturnValue(bot);

      await botManager.startPolling('tenant-conflict', '123456:BOT_TOKEN', 'https://mypanel.com');

      // Trigger Grammy error boundary with 409 Conflict
      const errorHandler = (bot as any).errorHandler;
      if (errorHandler) {
        await errorHandler({ error: new Error('409: Conflict: terminated by other getUpdates request') });
      }

      expect(stopSpy).toHaveBeenCalledWith('tenant-conflict');
    });
  });
});
