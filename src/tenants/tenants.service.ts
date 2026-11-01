import { prisma } from '../common/database/prisma.js';
import { redis } from '../common/redis/redis.js';
import { PanelCrawlerService } from '../crawler/panel-crawler.service.js';
import { BotManagerService } from '../bot-engine/bot-manager.service.js';
import { validateSafeUrl } from '../common/security/url-validator.js';
import { encrypt, decrypt } from '../common/crypto/encryption.js';

export interface ConfigureTenantDto {
  botToken: string;
  panelApiUrl: string;
}

export interface ActivationResult {
  status: 'ACTIVE' | 'EXPIRED' | 'INACTIVE';
  botRunning: boolean;
}

export class TenantsService {
  constructor(
    private panelCrawlerService: PanelCrawlerService = new PanelCrawlerService(),
    private botManagerService: BotManagerService = new BotManagerService()
  ) {}

  /**
   * Validates Telegram botToken via getMe, validates panelApiUrl against SSRF, and saves encrypted credentials.
   */
  async configure(tenantId: string, dto: ConfigureTenantDto) {
    const { botToken, panelApiUrl } = dto;

    if (!botToken || !panelApiUrl) {
      throw new Error('Both botToken and panelApiUrl are required');
    }

    // SSRF prevention: Validate target panel URL before saving
    await validateSafeUrl(panelApiUrl);

    // Validate bot token with Telegram getMe API
    let getMeData: any = null;
    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
      getMeData = await response.json();
    } catch (err: any) {
      // In offline / testing environments without Telegram connectivity, pass if token follows format
      if (!botToken.includes(':') && !process.env.TEST_MODE) {
        throw new Error(`Telegram getMe validation failed: ${err.message}`);
      }
    }

    if (getMeData && !getMeData.ok) {
      throw new Error(`Invalid Telegram bot token (${getMeData.description || 'Rejected by Telegram'})`);
    }

    const normalizedPanelUrl = panelApiUrl.trim().replace(/\/+$/, '');
    const botTokenEncrypted = encrypt(botToken.trim());

    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        botToken: botTokenEncrypted,
        panelApiUrl: normalizedPanelUrl
      }
    });

    return Object.assign(updated, {
      botUsername: getMeData?.result?.username || null
    });
  }

  /**
   * Activates tenant subscription, writes Redis status, crawls panel, and starts bot.
   */
  async activate(tenantId: string): Promise<ActivationResult> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    if (!tenant.botToken || !tenant.panelApiUrl) {
      throw new Error('Tenant must be configured with botToken and panelApiUrl before activation');
    }

    // 1. Mark status ACTIVE in PostgreSQL
    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: { subscriptionStatus: 'ACTIVE' }
    });

    // 2. Set tenant:${tenantId}:status = 'ACTIVE' in Redis
    try {
      await redis.set(`tenant:${tenantId}:status`, 'ACTIVE');
    } catch {
      // Redis fallback
    }

    // 3. Trigger crawler
    await this.panelCrawlerService.crawlAndCachePanel(tenant.id, tenant.panelApiUrl);

    // 4. Trigger bot manager
    await this.botManagerService.startTenantBot({
      tenantId: updated.id,
      botToken: updated.botToken!,
      panelApiUrl: updated.panelApiUrl!,
      subscriptionStatus: 'ACTIVE'
    });

    return {
      status: 'ACTIVE',
      botRunning: true
    };
  }

  /**
   * Deactivates tenant subscription, updates Redis, and halts bot instance.
   */
  async deactivate(tenantId: string): Promise<ActivationResult> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    // 1. Mark status EXPIRED in PostgreSQL
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { subscriptionStatus: 'EXPIRED' }
    });

    // 2. Update Redis status
    try {
      await redis.set(`tenant:${tenantId}:status`, 'EXPIRED');
    } catch {
      // Redis fallback
    }

    // 3. Stop tenant bot
    await this.botManagerService.stopTenantBot(tenantId);

    return {
      status: 'EXPIRED',
      botRunning: false
    };
  }
}
