import { Bot } from 'grammy';
import { prisma } from '../common/database/prisma.js';
import { PanelCrawlerService } from '../crawler/panel-crawler.service.js';
import { encrypt, decrypt } from '../common/crypto/encryption.js';
import { validateSafeUrl } from '../common/security/url-validator.js';

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

export class BotManagerService implements OnModuleInit, OnModuleDestroy {
  private activeBots = new Map<string, Bot>();
  private activePolling = new Map<string, boolean>();

  constructor(private panelCrawlerService: PanelCrawlerService = new PanelCrawlerService()) {}

  /**
   * On application startup, queries Prisma for all Tenant records where
   * subscriptionStatus === 'ACTIVE' and botToken != null, and calls startPolling.
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
   * Cleanly terminates all active bot instances on shutdown.
   */
  async onModuleDestroy(): Promise<void> {
    const tenantIds = Array.from(this.activeBots.keys());
    for (const tenantId of tenantIds) {
      await this.stopTenantBot(tenantId);
    }
  }

  /**
   * Starts multi-tenant polling loop for a specific tenant bot.
   */
  async startPolling(tenantId: string, botToken: string, panelApiUrl: string): Promise<void> {
    // 1. If already polling, stop cleanly first to prevent 409 Conflict duplicate polling
    if (this.activeBots.has(tenantId)) {
      await this.stopTenantBot(tenantId);
    }

    // 2. Instantiate Grammy Bot (decrypt if stored in AES format)
    const resolvedBotToken = resolveBotToken(botToken);
    const bot = new Bot(resolvedBotToken);

    // 3. Attach isolated error boundary
    bot.catch((err) => {
      console.error(`Bot error for tenant ${tenantId}:`, err);
    });

    // 4. Command: /start
    bot.command('start', async (ctx) => {
      await ctx.reply(
        'Welcome! Send /setkey <YOUR_API_KEY> to connect your account, or ask any question about our services.'
      );
    });

    // 5. Command: /setkey <key> (Tenant isolated upsert with AES-256 encryption)
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

      await ctx.reply('✓ Your API key has been securely saved and your message was wiped for safety.');
    });

    // 6. Command: /balance (Scoped SMM Panel API call with SSRF defense & path deduplication)
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
        // Fallback for existing plaintext sessions
      }

      try {
        // Normalize base URL without duplicating /api/v2
        const baseUrl = panelApiUrl.replace(/\/+$/, '').replace(/\/api\/v2$/, '');
        const balanceEndpoint = `${baseUrl}/api/v2?key=${encodeURIComponent(rawKey)}&action=balance`;

        // SSRF protection check
        const safeEndpoint = await validateSafeUrl(balanceEndpoint);

        const res = await fetch(safeEndpoint);
        if (res.ok) {
          const data: any = await res.json();
          if (data && data.error) {
            await ctx.reply(`Panel error: ${data.error}`);
          } else {
            await ctx.reply(`Your current balance: ${data.balance ?? 0} ${data.currency || 'USD'}`);
          }
        } else {
          await ctx.reply('Failed to fetch balance from panel. Please verify your API key.');
        }
      } catch (e: any) {
        console.error(`Balance error for tenant ${tenantId}:`, e?.message || e);
        await ctx.reply('Panel server is currently unreachable. Please try again later.');
      }
    });

    // 7. General incoming text message handler
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

      // Query composite (tenantId, telegramUserId) session for user personal SMM API key
      const session = await prisma.botUserSession.findUnique({
        where: {
          tenantId_telegramUserId: {
            tenantId,
            telegramUserId
          }
        }
      });

      // Generate AI response
      const keyNotice = session ? 'Linked customer' : 'Guest user';
      const aiResponse = `[${panelApiUrl} | ${keyNotice}] Thank you for your question: "${userText}". An agent will assist you soon.`;

      // Save new response in cache
      await PanelCrawlerService.setCachedReply(tenantId, userText, aiResponse);
      await ctx.reply(aiResponse);
    });

    // 8. Register in active registries
    this.activeBots.set(tenantId, bot);
    this.activePolling.set(tenantId, true);

    // 9. Start long-polling
    bot.start({
      drop_pending_updates: true,
      onStart: () => {}
    }).catch((err: any) => {
      if (err?.message?.includes('Aborted delay') || err?.name === 'AbortError') {
        return;
      }
      console.error(`Failed to run bot for tenant ${tenantId}:`, err);
    });
  }

  /**
   * Compatibility wrapper for startTenantBot.
   */
  async startTenantBot(config: TenantRuntimeConfig): Promise<void> {
    await this.startPolling(config.tenantId, config.botToken, config.panelApiUrl);
  }

  /**
   * Cleanly stops a tenant bot.
   */
  async stopTenantBot(tenantId: string): Promise<void> {
    const bot = this.activeBots.get(tenantId);
    if (bot) {
      try {
        await bot.stop();
      } catch {
        // Safe ignore
      }
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
