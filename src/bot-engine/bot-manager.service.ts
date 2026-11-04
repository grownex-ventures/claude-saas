import crypto from 'crypto';
import { Bot } from 'grammy';
import { prisma } from '../common/database/prisma.js';
import { redis } from '../common/redis/redis.js';
import { PanelCrawlerService } from '../crawler/panel-crawler.service.js';
import { encrypt, decrypt } from '../common/crypto/encryption.js';
import { validateSafeUrl } from '../common/security/url-validator.js';
import { RuntimeLogService } from '../common/logging/runtime-log.service.js';
import { AiAgentService } from '../ai-engine/ai-agent.service.js';
import { SmmProviderClient, SmmService } from '../smm-core/smm-client.js';

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
    if (BotManagerService.instance) {
      return BotManagerService.instance;
    }
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
        try {
          await this.startTenantBot({
            tenantId: tenant.id,
            botToken: tenant.botToken,
            panelApiUrl: tenant.panelApiUrl || '',
            subscriptionStatus: tenant.subscriptionStatus
          });
        } catch (err: any) {
          console.warn(`[BotManager] Skipping startup for tenant ${tenant.id} with invalid bot token:`, err?.message || err);
        }
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
      const telegramUserId = String(ctx.from?.id);
      await this.ensureUserSession(tenantId, ctx.from);

      RuntimeLogService.record({
        tenantId,
        channel: 'telegram',
        level: 'info',
        event: 'COMMAND_START',
        message: `User ${telegramUserId} issued /start`,
        details: { userId: telegramUserId, username: ctx.from?.username }
      }).catch(() => {});

      const welcomeText =
        `👋 **Welcome to 24/7 Customer Support!**\n\n` +
        `I am your dedicated AI assistant. Here is what I can do for you:\n\n` +
        `• 💰 **/balance** — Check your account balance\n` +
        `• 📦 **/status <order_id>** — Track live order progress\n` +
        `• 📋 **/services [keyword]** — Browse our service catalog & pricing\n` +
        `• 🔑 **/setkey <YOUR_API_KEY>** — Connect your panel account\n` +
        `• ❓ **/help** — View commands & instructions\n\n` +
        `💬 *Or simply type any question here to chat with our AI support!*`;

      await this.saveChatMessage(tenantId, telegramUserId, 'user', '/start');
      await this.saveChatMessage(tenantId, telegramUserId, 'assistant', welcomeText);

      await ctx.reply(welcomeText, { parse_mode: 'Markdown' }).catch(() => ctx.reply(welcomeText));
    });

    // Command: /help
    bot.command('help', async (ctx) => {
      const telegramUserId = String(ctx.from?.id);
      await this.ensureUserSession(tenantId, ctx.from);

      const helpText =
        `ℹ️ **Available Bot Commands:**\n\n` +
        `• **/balance** — Check your remaining balance\n` +
        `• **/status <order_id>** — Check status of an order (e.g. \`/status 123456\`)\n` +
        `• **/services <keyword>** — Search services & rates (e.g. \`/services instagram\`)\n` +
        `• **/setkey <api_key>** — Link your panel API key securely\n` +
        `• **/help** — Show this guide\n\n` +
        `💡 *You can also ask questions naturally like "how do refills work?" or "what are your YouTube prices?".*`;

      await this.saveChatMessage(tenantId, telegramUserId, 'user', '/help');
      await this.saveChatMessage(tenantId, telegramUserId, 'assistant', helpText);

      await ctx.reply(helpText, { parse_mode: 'Markdown' }).catch(() => ctx.reply(helpText));
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
          userPanelKey: encryptedKey,
          telegramUsername: ctx.from?.username || null,
          telegramFirstName: ctx.from?.first_name || null
        },
        create: {
          tenantId,
          telegramUserId,
          userPanelKey: encryptedKey,
          telegramUsername: ctx.from?.username || null,
          telegramFirstName: ctx.from?.first_name || null
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

      const replyText = '✓ Your API key has been securely saved and your message was wiped for safety.';
      await this.saveChatMessage(tenantId, telegramUserId, 'user', '/setkey [REDACTED]');
      await this.saveChatMessage(tenantId, telegramUserId, 'assistant', replyText);

      await ctx.reply(replyText);
    });

    // Command: /balance (Scoped SMM Panel API call with SSRF defense)
    bot.command('balance', async (ctx) => {
      const telegramUserId = String(ctx.from?.id);
      await this.ensureUserSession(tenantId, ctx.from);
      await this.saveChatMessage(tenantId, telegramUserId, 'user', '/balance');

      const session = await prisma.botUserSession.findUnique({
        where: {
          tenantId_telegramUserId: {
            tenantId,
            telegramUserId
          }
        }
      });

      if (!session || !session.userPanelKey) {
        const noKeyMsg = 'No API key found. Please link your account first via /setkey <KEY>.';
        await this.saveChatMessage(tenantId, telegramUserId, 'assistant', noKeyMsg);
        await ctx.reply(noKeyMsg);
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
            const errMsg = `Panel error: ${data.error}`;
            await this.saveChatMessage(tenantId, telegramUserId, 'assistant', errMsg);
            await ctx.reply(errMsg);
          } else {
            RuntimeLogService.record({
              tenantId,
              channel: 'telegram',
              level: 'success',
              event: 'BALANCE_CHECK_SUCCESS',
              message: `User ${telegramUserId} checked balance: ${data.balance ?? 0} ${data.currency || 'USD'}`,
              details: { userId: telegramUserId, balance: data.balance, currency: data.currency }
            }).catch(() => {});
            const balMsg = `💰 **Your current balance:** ${data.balance ?? 0} ${data.currency || 'USD'}`;
            await this.saveChatMessage(tenantId, telegramUserId, 'assistant', balMsg);
            await ctx.reply(balMsg, { parse_mode: 'Markdown' }).catch(() => ctx.reply(balMsg));
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
          const failMsg = 'Failed to fetch balance from panel. Please verify your API key.';
          await this.saveChatMessage(tenantId, telegramUserId, 'assistant', failMsg);
          await ctx.reply(failMsg);
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
        const unreachMsg = 'Panel server is currently unreachable. Please try again later.';
        await this.saveChatMessage(tenantId, telegramUserId, 'assistant', unreachMsg);
        await ctx.reply(unreachMsg);
      }
    });

    // Command: /status <order_id> (Live SMM Order Status Lookup)
    bot.command('status', async (ctx) => {
      const telegramUserId = String(ctx.from?.id);
      await this.ensureUserSession(tenantId, ctx.from);

      const parts = ctx.message?.text?.split(/\s+/) || [];
      const orderId = parts[1]?.trim()?.replace(/[^\d]/g, '');

      if (!orderId) {
        const usageText = 'Usage: /status <order_id>\nExample: `/status 10245`';
        await ctx.reply(usageText, { parse_mode: 'Markdown' }).catch(() => ctx.reply(usageText));
        return;
      }

      await this.saveChatMessage(tenantId, telegramUserId, 'user', ctx.message?.text || `/status ${orderId}`);

      const session = await prisma.botUserSession.findUnique({
        where: { tenantId_telegramUserId: { tenantId, telegramUserId } }
      });

      let rawKey = '';
      if (session?.userPanelKey) {
        try {
          rawKey = decrypt(session.userPanelKey);
        } catch {}
      }

      try {
        const baseUrl = panelApiUrl.replace(/\/+$/, '').replace(/\/api\/v2$/, '');
        const clientKey = rawKey || (await this.getTenantCatalogKey(tenantId));

        if (!clientKey || !baseUrl) {
          const promptKey = 'To track orders live, please connect your panel account first with /setkey <YOUR_API_KEY>.';
          await this.saveChatMessage(tenantId, telegramUserId, 'assistant', promptKey);
          await ctx.reply(promptKey);
          return;
        }

        const client = new SmmProviderClient(baseUrl, clientKey);
        const order = await client.getOrderStatus(orderId);

        const statusText =
          `📦 **Order #${orderId} Status Details:**\n\n` +
          `• **Status:** ${order.status || 'Processing'}\n` +
          `• **Start Count:** ${order.start_count ?? 'N/A'}\n` +
          `• **Remains:** ${order.remains ?? 'N/A'}\n` +
          `• **Charge:** ${order.charge !== undefined && order.charge !== null ? `${order.charge} ${order.currency || 'USD'}`.trim() : 'N/A'}`;

        await this.saveChatMessage(tenantId, telegramUserId, 'assistant', statusText);
        await ctx.reply(statusText, { parse_mode: 'Markdown' }).catch(() => ctx.reply(statusText));
      } catch (err: any) {
        const errText = `❌ Could not retrieve status for Order #${orderId}: ${err?.message || 'Server unreachable or invalid order ID'}`;
        await this.saveChatMessage(tenantId, telegramUserId, 'assistant', errText);
        await ctx.reply(errText);
      }
    });

    // Command: /services [keyword] (Live SMM Services Catalog Lookup)
    bot.command('services', async (ctx) => {
      const telegramUserId = String(ctx.from?.id);
      await this.ensureUserSession(tenantId, ctx.from);

      const parts = ctx.message?.text?.split(/\s+/) || [];
      const query = parts.slice(1).join(' ').trim().toLowerCase();

      await this.saveChatMessage(tenantId, telegramUserId, 'user', ctx.message?.text || '/services');

      try {
        const services = await this.resolveTenantServices(tenantId, panelApiUrl);
        let matches = services;

        if (query) {
          matches = services.filter((s) => {
            const name = (s.name || '').toLowerCase();
            const cat = (s.category || '').toLowerCase();
            return name.includes(query) || cat.includes(query);
          });
        }

        const top = matches.slice(0, 8);
        if (top.length === 0) {
          const noMatchText = `No services found matching "${query}". Try searching for "instagram", "youtube", "views", or "followers".`;
          await this.saveChatMessage(tenantId, telegramUserId, 'assistant', noMatchText);
          await ctx.reply(noMatchText);
          return;
        }

        const formatted = top
          .map((s) => `• ID ${s.service}: **${s.name}** | Rate: $${s.rate}/1k | Min: ${s.min} | Max: ${s.max}`)
          .join('\n');

        const replyText =
          `⚡ **Matching Services (${matches.length} found):**\n\n${formatted}\n\n` +
          `💡 *To search specifically, use:* \`/services <keyword>\``;

        await this.saveChatMessage(tenantId, telegramUserId, 'assistant', replyText);
        await ctx.reply(replyText, { parse_mode: 'Markdown' }).catch(() => ctx.reply(replyText));
      } catch (err: any) {
        const errText = `Could not load services catalog: ${err?.message || 'Catalog unavailable'}`;
        await this.saveChatMessage(tenantId, telegramUserId, 'assistant', errText);
        await ctx.reply(errText);
      }
    });

    // General incoming text message handler (AI Support Agent)
    bot.on('message:text', async (ctx) => {
      const telegramUserId = String(ctx.from?.id);
      const userText = ctx.message.text.trim();

      if (userText.startsWith('/')) return;

      await this.ensureUserSession(tenantId, ctx.from);

      // 1. Save user message to database
      await this.saveChatMessage(tenantId, telegramUserId, 'user', userText);

      // 2. Fetch last 6 message turns from database for this specific user
      let history: { role: 'user' | 'assistant'; content: string }[] = [];
      try {
        const recentMessages = await prisma.telegramChatMessage.findMany({
          where: { tenantId, telegramUserId },
          orderBy: { createdAt: 'desc' },
          take: 6
        });
        history = [...recentMessages].reverse().map((m) => ({
          role: (m.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
          content: m.content
        }));
      } catch {}

      try {
        const reply = await AiAgentService.getInstance().generateReply({
          tenantId,
          message: userText,
          channel: 'telegram',
          userId: telegramUserId,
          history
        });

        // 3. Save bot response to database
        await this.saveChatMessage(tenantId, telegramUserId, 'assistant', reply);

        await ctx.reply(reply);
      } catch (err: any) {
        console.warn(`[BotManager] Telegram AI reply error for tenant ${tenantId}:`, err?.message || err);
        const fallback = `Thank you for your message. An agent is reviewing your query. You can check order status with /status <order_id> or view services with /services.`;
        await this.saveChatMessage(tenantId, telegramUserId, 'assistant', fallback);
        await ctx.reply(fallback);
      }
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
        err?.message?.includes('Conflict') ||
        err?.error_code === 401 ||
        err?.description?.includes('Unauthorized')
      ) {
        console.warn(`[BotManager] Telegram polling for tenant ${tenantId} ended (${err?.description || err?.message || 'Conflict/Auth error'})`);
        this.stopTenantBot(tenantId).catch(() => {});
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

  async saveChatMessage(
    tenantId: string,
    telegramUserId: string,
    role: 'user' | 'assistant',
    content: string
  ): Promise<void> {
    try {
      await prisma.telegramChatMessage.create({
        data: {
          tenantId,
          telegramUserId,
          role,
          content
        }
      });
    } catch (err: any) {
      console.warn(`[BotManager] Failed to persist Telegram chat turn for tenant ${tenantId}, user ${telegramUserId}:`, err?.message || err);
    }
  }

  async ensureUserSession(
    tenantId: string,
    from?: { id: number | string; username?: string; first_name?: string }
  ): Promise<void> {
    if (!from || !from.id) return;
    const telegramUserId = String(from.id);
    try {
      await prisma.botUserSession.upsert({
        where: {
          tenantId_telegramUserId: {
            tenantId,
            telegramUserId
          }
        },
        update: {
          telegramUsername: from.username || null,
          telegramFirstName: from.first_name || null
        },
        create: {
          tenantId,
          telegramUserId,
          telegramUsername: from.username || null,
          telegramFirstName: from.first_name || null
        }
      });
    } catch (err: any) {
      console.warn(`[BotManager] Failed to upsert BotUserSession for user ${telegramUserId}:`, err?.message || err);
    }
  }

  private async getTenantCatalogKey(tenantId: string): Promise<string> {
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { widgetApiKey: true }
      });
      if (tenant?.widgetApiKey) {
        return decrypt(tenant.widgetApiKey);
      }
    } catch {}
    return '';
  }

  private async resolveTenantServices(tenantId: string, panelApiUrl: string): Promise<SmmService[]> {
    try {
      const cached = await redis.get(`tenant:${tenantId}:crawl:services`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { crawledData: true, widgetApiKey: true }
    });

    if (tenant?.crawledData && Array.isArray(tenant.crawledData) && tenant.crawledData.length > 0) {
      return tenant.crawledData as unknown as SmmService[];
    }

    if (tenant?.widgetApiKey && panelApiUrl) {
      try {
        const key = decrypt(tenant.widgetApiKey);
        const client = new SmmProviderClient(panelApiUrl, key);
        return await client.getServices();
      } catch {}
    }

    return [];
  }

  getActiveBotCount(): number {
    return this.activeBots.size;
  }

  isBotRunning(tenantId: string): boolean {
    return this.activePolling.get(tenantId) === true;
  }
}

export const botManagerService = BotManagerService.getInstance();
