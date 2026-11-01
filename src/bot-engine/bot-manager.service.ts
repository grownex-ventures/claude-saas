import crypto from 'crypto';
import { Bot } from 'grammy';
import { prisma } from '../common/database/prisma.js';
import { redis } from '../common/redis/redis.js';
import { PanelCrawlerService } from '../crawler/panel-crawler.service.js';
import { encrypt, decrypt } from '../common/crypto/encryption.js';
import { validateSafeUrl } from '../common/security/url-validator.js';
import { RuntimeLogService } from '../common/logging/runtime-log.service.js';

function resolveBotToken(token: string): string {
  if (!token) return '';
  const parts = token.split(':');
  if (
    parts.length === 3 &&
    parts.every((p) => /^[0-9a-fA-F]+$/.test(p)) &&
    parts[0].length === 24 &&
    parts[1].length === 32
  ) {
    try {
      return decrypt(token);
    } catch {
      return token;
    }
  }
  return token;
}

export interface TenantRuntimeConfig {
  tenantId: string;
  botToken: string;
  panelApiUrl: string;
  subscriptionStatus: 'INACTIVE' | 'ACTIVE' | 'EXPIRED';
}

export interface OnModuleInit {
  onModuleInit(): Promise<void> | void;
}

export interface OnModuleDestroy {
  onModuleDestroy(): Promise<void> | void;
}

/**
 * Multi-tenant Telegram Bot Manager (ARC-02)
 * Supports both Webhook mode (with constant-time secret_token validation)
 * and Polling mode with distributed Redis lock and 409 Conflict auto-recovery.
 */
export class BotManagerService implements OnModuleInit, OnModuleDestroy {
  private static instance: BotManagerService;
  private activeBots = new Map<string, Bot>();
  private activePolling = new Map<string, boolean>();
  private lockRenewalTimers = new Map<string, NodeJS.Timeout>();
  private lockRetryTimers = new Map<string, NodeJS.Timeout>();
  private readonly instanceId = crypto.randomUUID();

  constructor(private panelCrawlerService: PanelCrawlerService = new PanelCrawlerService()) {
    BotManagerService.instance = this;
  }

  static getInstance(): BotManagerService {
    if (!BotManagerService.instance) {
      BotManagerService.instance = new BotManagerService();
    }
    return BotManagerService.instance;
  }

  /**
   * Generates a deterministic secret token for verifying Telegram webhooks.
   */
  getSecretToken(tenantId: string): string {
    const key = process.env.ENCRYPTION_KEY || 'default-secret-token-key-32chars!!';
    return crypto.createHmac('sha256', key).update(`tg-webhook-${tenantId}`).digest('hex');
  }

  /**
   * On application startup, queries Prisma for all Tenant records where
   * subscriptionStatus === 'ACTIVE' and botToken != null, and initializes bots.
   */
  async onModuleInit(): Promise<void> {
    const activeTenants = await prisma.tenant.findMany({
      where: {
        subscriptionStatus: 'ACTIVE',
        botToken: { not: null }
      }
    });

    for (const tenant of activeTenants) {
      if (tenant.botToken) {
        await this.startTenantBot({
          tenantId: tenant.id,
          botToken: tenant.botToken,
          panelApiUrl: tenant.panelApiUrl || '',
          subscriptionStatus: tenant.subscriptionStatus
        });
      }
    }
  }

  /**
   * Cleanly terminates all active bot instances and clears all distributed timers on shutdown.
   */
  async onModuleDestroy(): Promise<void> {
    const tenantIds = Array.from(this.activeBots.keys());
    for (const tenantId of tenantIds) {
      await this.stopTenantBot(tenantId);
    }
  }

  /**
   * Factory method to build a Grammy Bot with all multi-tenant commands and handlers.
   */
  buildBot(tenantId: string, botToken: string, panelApiUrl: string): Bot {
    const resolvedBotToken = resolveBotToken(botToken);
    const bot = new Bot(resolvedBotToken);

    // Isolated error boundary with graceful 409 Conflict handling
    bot.catch((err) => {
      const msg = (err as any)?.error?.message || err?.message || String(err);
      if (msg.includes('409') || msg.includes('Conflict')) {
        console.warn(`[BotManager] Telegram 409 Conflict for tenant ${tenantId}. Stopping polling.`);
        this.stopTenantBot(tenantId).catch(() => {});
        return;
      }
      console.error(`Bot error for tenant ${tenantId}:`, err);
    });

    // Command: /start
    bot.command('start', async (ctx) => {
      RuntimeLogService.record({
        tenantId,
        channel: 'telegram',
        level: 'info',
        event: 'COMMAND_START',
        message: `User ${ctx.from?.id} issued /start`,
        details: { userId: ctx.from?.id, username: ctx.from?.username }
      }).catch(() => {});

      await ctx.reply(
        'Welcome! Send /setkey <YOUR_API_KEY> to connect your account, or ask any question about our services.'
      );
    });

    // Command: /setkey <key> (Tenant isolated upsert with AES-256 encryption)
    bot.command('setkey', async (ctx) => {
      const parts = ctx.message?.text?.split(' ') || [];
      const userKey = parts[1]?.trim();

      if (!userKey) {
        await ctx.reply('Usage: /setkey <YOUR_API_KEY>');
        return;
      }

      // CWE-532: Auto-delete user's API key from chat transcript immediately
      await ctx.deleteMessage().catch(() => {});

      const telegramUserId = String(ctx.from?.id);
      const encryptedKey = encrypt(userKey);

      await prisma.botUserSession.upsert({
        where: {
          tenantId_telegramUserId: {
            tenantId,
            telegramUserId
          }
        },
        update: {
          userPanelKey: encryptedKey
        },
        create: {
          tenantId,
          telegramUserId,
          userPanelKey: encryptedKey
        }
      });

      RuntimeLogService.record({
        tenantId,
        channel: 'telegram',
        level: 'success',
        event: 'API_KEY_SAVED',
        message: `User ${telegramUserId} linked panel API key`,
        details: { userId: telegramUserId, username: ctx.from?.username }
      }).catch(() => {});

      await ctx.reply('✓ Your API key has been securely saved and your message was wiped for safety.');
    });

    // Command: /balance (Scoped SMM Panel API call with SSRF defense)
    bot.command('balance', async (ctx) => {
      const telegramUserId = String(ctx.from?.id);
      const session = await prisma.botUserSession.findUnique({
        where: {
          tenantId_telegramUserId: {
            tenantId,
            telegramUserId
          }
        }
      });

      if (!session) {
        await ctx.reply('No API key found. Please link your account first via /setkey <KEY>.');
        return;
      }

      let rawKey = session.userPanelKey;
      try {
        rawKey = decrypt(session.userPanelKey);
      } catch {
        // Plaintext fallback
      }

      try {
        const baseUrl = panelApiUrl.replace(/\/+$/, '').replace(/\/api\/v2$/, '');
        const balanceEndpoint = `${baseUrl}/api/v2?key=${encodeURIComponent(rawKey)}&action=balance`;

        const safeEndpoint = await validateSafeUrl(balanceEndpoint);

        const res = await fetch(safeEndpoint);
        if (res.ok) {
          const data: any = await res.json();
          if (data && data.error) {
            RuntimeLogService.record({
              tenantId,
              channel: 'telegram',
              level: 'warn',
              event: 'BALANCE_CHECK_PANEL_ERROR',
              message: `Balance lookup for user ${telegramUserId} returned error: ${data.error}`,
              details: { userId: telegramUserId }
            }).catch(() => {});
            await ctx.reply(`Panel error: ${data.error}`);
          } else {
            RuntimeLogService.record({
              tenantId,
              channel: 'telegram',
              level: 'success',
              event: 'BALANCE_CHECK_SUCCESS',
              message: `User ${telegramUserId} checked balance: ${data.balance ?? 0} ${data.currency || 'USD'}`,
              details: { userId: telegramUserId, balance: data.balance, currency: data.currency }
            }).catch(() => {});
            await ctx.reply(`Your current balance: ${data.balance ?? 0} ${data.currency || 'USD'}`);
          }
        } else {
          RuntimeLogService.record({
            tenantId,
            channel: 'telegram',
            level: 'warn',
            event: 'BALANCE_CHECK_HTTP_FAILED',
            message: `Panel returned HTTP ${res.status} for balance lookup`,
            details: { userId: telegramUserId, status: res.status }
          }).catch(() => {});
          await ctx.reply('Failed to fetch balance from panel. Please verify your API key.');
        }
      } catch (e: any) {
        console.error(`Balance error for tenant ${tenantId}:`, e?.message || e);
        RuntimeLogService.record({
          tenantId,
          channel: 'telegram',
          level: 'error',
          event: 'BALANCE_CHECK_EXCEPTION',
          message: `Network error connecting to panel for user ${telegramUserId}`,
          details: { userId: telegramUserId, error: e?.message }
        }).catch(() => {});
        await ctx.reply('Panel server is currently unreachable. Please try again later.');
      }
    });

    // General incoming text message handler
    bot.on('message:text', async (ctx) => {
      const telegramUserId = String(ctx.from?.id);
      const userText = ctx.message.text.trim();

      if (userText.startsWith('/')) return;

      // Check pre-generated AI cached reply first
      const cachedReply = await PanelCrawlerService.getCachedReply(tenantId, userText);
      if (cachedReply) {
        await ctx.reply(cachedReply);
        return;
      }

      const session = await prisma.botUserSession.findUnique({
        where: {
          tenantId_telegramUserId: {
            tenantId,
            telegramUserId
          }
        }
      });

      const keyNotice = session ? 'Linked customer' : 'Guest user';
      const aiResponse = `[${panelApiUrl} | ${keyNotice}] Thank you for your question: "${userText}". An agent will assist you soon.`;

      await PanelCrawlerService.setCachedReply(tenantId, userText, aiResponse);
      await ctx.reply(aiResponse);
    });

    return bot;
  }

  /**
   * Starts bot in either webhook or multi-instance polling mode.
   */
  async startPolling(tenantId: string, botToken: string, panelApiUrl: string): Promise<void> {
    if (this.activeBots.has(tenantId)) {
      await this.stopTenantBot(tenantId);
    }

    const bot = this.buildBot(tenantId, botToken, panelApiUrl);
    this.activeBots.set(tenantId, bot);

    const mode = (process.env.TELEGRAM_MODE || 'polling').toLowerCase();

    // Mode A: Webhook mode (ARC-02 Preferred)
    if (mode === 'webhook') {
      const baseUrl = (process.env.TELEGRAM_WEBHOOK_BASE_URL || '').replace(/\/+$/, '');
      const secretToken = this.getSecretToken(tenantId);
      if (baseUrl) {
        const webhookUrl = `${baseUrl}/api/telegram/webhook/${tenantId}`;
        try {
          await bot.api.setWebhook(webhookUrl, {
            secret_token: secretToken,
            drop_pending_updates: true
          });
          console.log(`[BotManager] Webhook active for tenant ${tenantId} at ${webhookUrl}`);
        } catch (err: any) {
          console.error(`[BotManager] Failed to set Telegram webhook for tenant ${tenantId}:`, err?.message || err);
        }
      }
      this.activePolling.set(tenantId, true);
      return;
    }

    // Mode B: Polling mode with distributed Redis lock (ARC-02 Polling multi-instance safety)
    const lockKey = `lock:telegram:poll:${tenantId}`;
    let lockAcquired = false;

    try {
      const res = await redis.set(lockKey, this.instanceId, 'EX', 30, 'NX');
      lockAcquired = res === 'OK';
    } catch {
      // In offline / testing mode where Redis is unavailable, allow local polling
      lockAcquired = true;
    }

    if (!lockAcquired) {
      console.log(`[BotManager] Standby: Another instance is polling bot for tenant ${tenantId}`);
      this.activePolling.set(tenantId, false);

      // Periodically check to take over if master polling instance crashes
      const retryTimer = setInterval(async () => {
        try {
          const res = await redis.set(lockKey, this.instanceId, 'EX', 30, 'NX');
          if (res === 'OK') {
            clearInterval(retryTimer);
            this.lockRetryTimers.delete(tenantId);
            this.executePolling(tenantId, bot, lockKey);
          }
        } catch {}
      }, 15000);

      this.lockRetryTimers.set(tenantId, retryTimer);
      return;
    }

    this.executePolling(tenantId, bot, lockKey);
  }

  private executePolling(tenantId: string, bot: Bot, lockKey: string): void {
    this.activePolling.set(tenantId, true);

    // Heartbeat TTL renewal every 10 seconds
    const renewTimer = setInterval(async () => {
      try {
        const currentOwner = await redis.get(lockKey);
        if (currentOwner === this.instanceId) {
          await redis.expire(lockKey, 30);
        }
      } catch {}
    }, 10000);
    this.lockRenewalTimers.set(tenantId, renewTimer);

    bot.start({
      drop_pending_updates: true,
      onStart: () => {}
    }).catch((err: any) => {
      if (
        err?.message?.includes('Aborted delay') ||
        err?.name === 'AbortError' ||
        err?.message?.includes('409') ||
        err?.message?.includes('Conflict')
      ) {
        return;
      }
      console.error(`Failed to run bot for tenant ${tenantId}:`, err);
    });
  }

  /**
   * Dispatches incoming Telegram webhook update with constant-time secret_token verification.
   */
  async handleWebhookUpdate(
    tenantId: string,
    secretHeader: string | undefined,
    update: any
  ): Promise<{ success: boolean; error?: string }> {
    if (!secretHeader || typeof secretHeader !== 'string') {
      return { success: false, error: 'Missing webhook secret token header' };
    }

    const expectedSecret = this.getSecretToken(tenantId);
    const headerBuf = Buffer.from(secretHeader);
    const expectedBuf = Buffer.from(expectedSecret);

    if (
      headerBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(headerBuf, expectedBuf)
    ) {
      return { success: false, error: 'Unauthorized secret token' };
    }

    let bot = this.activeBots.get(tenantId);
    if (!bot) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId }
      });
      if (!tenant || !tenant.botToken || tenant.subscriptionStatus !== 'ACTIVE') {
        return { success: false, error: 'Tenant bot not active' };
      }
      bot = this.buildBot(tenant.id, tenant.botToken, tenant.panelApiUrl || '');
      this.activeBots.set(tenantId, bot);
    }

    try {
      await bot.handleUpdate(update);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error processing update' };
    }
  }

  /**
   * Compatibility wrapper for startTenantBot.
   */
  async startTenantBot(config: TenantRuntimeConfig): Promise<void> {
    await this.startPolling(config.tenantId, config.botToken, config.panelApiUrl);
  }

  /**
   * Cleanly stops a tenant bot, cancels webhook if configured, and releases distributed locks.
   */
  async stopTenantBot(tenantId: string): Promise<void> {
    const renewTimer = this.lockRenewalTimers.get(tenantId);
    if (renewTimer) {
      clearInterval(renewTimer);
      this.lockRenewalTimers.delete(tenantId);
    }

    const retryTimer = this.lockRetryTimers.get(tenantId);
    if (retryTimer) {
      clearInterval(retryTimer);
      this.lockRetryTimers.delete(tenantId);
    }

    const bot = this.activeBots.get(tenantId);
    if (bot) {
      const mode = (process.env.TELEGRAM_MODE || 'polling').toLowerCase();
      if (mode === 'webhook') {
        try {
          await bot.api.deleteWebhook({ drop_pending_updates: false });
        } catch {}
      }

      const lockKey = `lock:telegram:poll:${tenantId}`;
      try {
        const currentOwner = await redis.get(lockKey);
        if (currentOwner === this.instanceId) {
          await redis.del(lockKey);
        }
      } catch {}

      try {
        await bot.stop();
      } catch {}

      this.activeBots.delete(tenantId);
      this.activePolling.delete(tenantId);
    }
  }

  getActiveBotCount(): number {
    return this.activeBots.size;
  }

  isBotRunning(tenantId: string): boolean {
    return this.activePolling.get(tenantId) === true;
  }
}

export const botManagerService = BotManagerService.getInstance();
