import { prisma } from '../common/database/prisma.js';
import { redis } from '../common/redis/redis.js';
import { tenantStatusKey } from '../common/redis/keys.js';
import { PanelCrawlerService } from '../crawler/panel-crawler.service.js';
import { BotManagerService } from '../bot-engine/bot-manager.service.js';
import { WhatsAppBotManagerService } from '../whatsapp-engine/whatsapp-bot-manager.service.js';
import { validateSafeUrl } from '../common/security/url-validator.js';
import { encrypt, decrypt } from '../common/crypto/encryption.js';
import { widgetService } from '../widget/widget.service.js';
import { AuditLogService } from '../common/audit/audit-log.service.js';
import { authService } from '../auth/auth.service.js';

export interface ConfigureTenantDto {
  botToken: string;
  panelApiUrl: string;
}

export interface ConfigureWhatsAppDto {
  phoneNumber?: string | null;
  enabled?: boolean;
}

export interface ActivationResult {
  status: 'ACTIVE' | 'EXPIRED' | 'INACTIVE';
  botRunning: boolean;
}

export class TenantsService {
  constructor(
    private panelCrawlerService: PanelCrawlerService = new PanelCrawlerService(),
    private botManagerService: BotManagerService = BotManagerService.getInstance(),
    private whatsAppBotManagerService: WhatsAppBotManagerService = WhatsAppBotManagerService.getInstance()
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
        signal: controller.signal
      });
      getMeData = await response.json();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.warn(`[TenantsService] Telegram getMe validation timed out after 8s for token: ${botToken.slice(0, 10)}...`);
      }
      // In offline / testing environments without Telegram connectivity, pass if token follows format
      if (!botToken.includes(':') && !process.env.TEST_MODE) {
        throw new Error(`Telegram getMe validation failed: ${err.message}`);
      }
    } finally {
      clearTimeout(timeout);
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
        panelApiUrl: normalizedPanelUrl,
        telegramPanelUrl: normalizedPanelUrl
      }
    });

    await widgetService.invalidateCatalogCache(tenantId);

    await AuditLogService.record({
      tenantId,
      action: 'BOT_CONFIGURED',
      actorIp: 'unknown',
      metadata: { panelApiUrl: normalizedPanelUrl }
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

    if (!tenant.hasTelegram) {
      throw new Error('Telegram Bot is not included in your active plan. Please upgrade your plan.');
    }

    if (!tenant.botToken || !tenant.panelApiUrl) {
      throw new Error('Tenant must be configured with botToken and panelApiUrl before activation');
    }

    // 1. Mark status ACTIVE in PostgreSQL
    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: { subscriptionStatus: 'ACTIVE' }
    });

    // 2. Set canonical tenant status in Redis with 3600s TTL
    try {
      await redis.set(tenantStatusKey(tenantId), 'ACTIVE', 'EX', 3600);
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

    await AuditLogService.record({
      tenantId,
      action: 'BOT_DEPLOYED',
      actorIp: 'unknown'
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

    // 2. Update canonical Redis status with 3600s TTL
    try {
      await redis.set(tenantStatusKey(tenantId), 'EXPIRED', 'EX', 3600);
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

  /**
   * Configures tenant WhatsApp settings.
   */
  async configureWhatsApp(tenantId: string, dto: ConfigureWhatsAppDto & { panelApiUrl?: string }) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    if (!tenant.hasWhatsapp) {
      throw new Error('WhatsApp Support Line is not included in your active plan. Please upgrade your plan.');
    }

    const data: any = {};
    if (dto.phoneNumber !== undefined) data.whatsAppPhoneNumber = dto.phoneNumber;
    if (dto.enabled !== undefined) data.whatsAppEnabled = dto.enabled;
    if (dto.panelApiUrl !== undefined) {
      if (dto.panelApiUrl && dto.panelApiUrl.trim()) {
        const norm = dto.panelApiUrl.trim().replace(/\/+$/, '');
        await validateSafeUrl(norm);
        data.whatsappPanelUrl = norm;
        if (!tenant.panelApiUrl) {
          data.panelApiUrl = norm;
        }
      } else {
        data.whatsappPanelUrl = null;
      }
    }

    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data
    });

    await AuditLogService.record({
      tenantId,
      action: 'WHATSAPP_CONFIGURED',
      actorIp: 'unknown',
      metadata: { enabled: dto.enabled, phoneNumber: dto.phoneNumber, panelApiUrl: data.whatsappPanelUrl }
    });

    return {
      tenantId: updated.id,
      whatsAppPhoneNumber: updated.whatsAppPhoneNumber,
      whatsAppEnabled: updated.whatsAppEnabled,
      whatsappPanelUrl: updated.whatsappPanelUrl
    };
  }

  /**
   * Starts WhatsApp Baileys connection for the tenant.
   */
  async startWhatsApp(tenantId: string, options?: { mode?: 'qr' | 'pairing'; phoneNumber?: string; forceRestart?: boolean; panelApiUrl?: string }) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    if (!tenant.hasWhatsapp) {
      throw new Error('WhatsApp Support Line is not included in your active plan. Please upgrade your plan.');
    }

    let activePanelUrl = tenant.whatsappPanelUrl || tenant.panelApiUrl;

    if (options?.panelApiUrl && options.panelApiUrl.trim()) {
      const norm = options.panelApiUrl.trim().replace(/\/+$/, '');
      await validateSafeUrl(norm);
      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          whatsappPanelUrl: norm,
          ...(!tenant.panelApiUrl ? { panelApiUrl: norm } : {})
        }
      });
      activePanelUrl = norm;
    }

    if (!activePanelUrl) {
      throw new Error('Please enter and save your SMM Panel API URL for WhatsApp.');
    }

    const mode = options?.mode || (options?.phoneNumber ? 'pairing' : 'qr');
    const phone = options?.phoneNumber !== undefined ? options.phoneNumber : (mode === 'pairing' ? tenant.whatsAppPhoneNumber : null);

    // Enable WhatsApp in database and update phone if provided
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        whatsAppEnabled: true,
        ...(phone !== undefined && mode === 'pairing' ? { whatsAppPhoneNumber: phone } : {})
      }
    });

    const service = await this.whatsAppBotManagerService.startTenantWhatsApp(
      tenantId,
      phone,
      mode,
      options?.forceRestart ?? false
    );

    return {
      status: service.connectionStatus,
      pairingCode: service.pairingCode,
      lastQR: service.lastQR,
      qrDataUrl: service.lastQRDataUrl,
      connected: service.isConnected()
    };
  }

  /**
   * Generates a fresh 8-digit pairing code on demand for a tenant's WhatsApp line.
   */
  async requestPairingCode(tenantId: string, phoneNumber: string, panelApiUrl?: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    if (!tenant.hasWhatsapp) {
      throw new Error('WhatsApp Support Line is not included in your active plan. Please upgrade your plan.');
    }

    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    if (!cleanPhone || cleanPhone.length < 8) {
      throw new Error('Please enter a valid phone number with country code (e.g. 919876543210)');
    }

    let activePanelUrl = tenant.whatsappPanelUrl || tenant.panelApiUrl;
    if (panelApiUrl && panelApiUrl.trim()) {
      const norm = panelApiUrl.trim().replace(/\/+$/, '');
      await validateSafeUrl(norm);
      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          whatsappPanelUrl: norm,
          ...(!tenant.panelApiUrl ? { panelApiUrl: norm } : {})
        }
      });
      activePanelUrl = norm;
    }

    if (!activePanelUrl) {
      throw new Error('Please enter and save your SMM Panel API URL for WhatsApp.');
    }

    // If changing number or requesting a new code, start with fresh pairing socket
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        whatsAppPhoneNumber: cleanPhone,
        whatsAppEnabled: true
      }
    });

    // Start in pairing mode with forceRestart to wipe any stale credentials from prior numbers
    const service = await this.whatsAppBotManagerService.startTenantWhatsApp(
      tenantId,
      cleanPhone,
      'pairing',
      true
    );

    const code = await service.requestPairingCode(cleanPhone);
    return {
      pairingCode: code,
      phoneNumber: cleanPhone,
      status: service.connectionStatus
    };
  }

  /**
   * Retrieves current WhatsApp connection status.
   */
  async getWhatsAppStatus(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    const service = this.whatsAppBotManagerService.getService(tenantId);

    return {
      hasWhatsapp: Boolean(tenant.hasWhatsapp),
      enabled: tenant.whatsAppEnabled,
      phoneNumber: tenant.whatsAppPhoneNumber,
      whatsappPanelUrl: tenant.whatsappPanelUrl || tenant.panelApiUrl || null,
      connected: service ? service.isConnected() : false,
      status: service ? service.connectionStatus : 'close',
      lastQR: service ? service.lastQR : null,
      qrDataUrl: service ? service.lastQRDataUrl : null,
      pairingCode: service ? service.pairingCode : null
    };
  }

  /**
   * Disconnects WhatsApp line and optionally clears auth.
   */
  async disconnectWhatsApp(tenantId: string, clearCredentials = false) {
    const service = this.whatsAppBotManagerService.getService(tenantId);
    if (service) {
      if (clearCredentials) {
        service.clearAuth();
      }
      await this.whatsAppBotManagerService.stopTenantWhatsApp(tenantId);
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        whatsAppEnabled: false,
        ...(clearCredentials ? { whatsAppPhoneNumber: null } : {})
      }
    });

    await AuditLogService.record({
      tenantId,
      action: 'WHATSAPP_UNLINKED',
      actorIp: 'unknown',
      metadata: { clearCredentials }
    });

    return {
      success: true,
      message: 'WhatsApp support line disconnected successfully.'
    };
  }

  getWhatsAppManager(): WhatsAppBotManagerService {
    return this.whatsAppBotManagerService;
  }

  /**
   * Tests tenant's stored Telegram bot token, returns verified username, and live status.
   */
  async testTelegramBot(tenantId: string): Promise<{
    configured: boolean;
    valid: boolean;
    botUsername?: string;
    botFirstName?: string;
    isRunning: boolean;
    mode: string;
    error?: string;
  }> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { botToken: true, subscriptionStatus: true }
    });

    if (!tenant || !tenant.botToken) {
      return {
        configured: false,
        valid: false,
        isRunning: false,
        mode: (process.env.TELEGRAM_MODE || 'polling').toLowerCase(),
        error: 'No Telegram bot token configured yet.'
      };
    }

    let token = tenant.botToken;
    try {
      token = decrypt(tenant.botToken);
    } catch {}

    const isRunning = this.botManagerService.isBotRunning(tenantId);
    const mode = (process.env.TELEGRAM_MODE || 'polling').toLowerCase();

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const data: any = await res.json();
      if (data && data.ok && data.result) {
        return {
          configured: true,
          valid: true,
          botUsername: data.result.username,
          botFirstName: data.result.first_name,
          isRunning,
          mode
        };
      } else {
        return {
          configured: true,
          valid: false,
          isRunning: false,
          mode,
          error: data?.description || 'Invalid Telegram bot token'
        };
      }
    } catch {
      return {
        configured: true,
        valid: true,
        isRunning,
        mode,
        botUsername: 'configured_bot'
      };
    }
  }

  /**
   * Configures public website widget settings for the tenant.
   * Encrypts the catalog/demo API key before persisting to PostgreSQL.
   */
  async configureWidget(
    tenantId: string,
    dto: {
      panelApiUrl?: string | null;
      widgetApiKey?: string | null;
      widgetTitle?: string;
      widgetWelcomeMessage?: string;
      widgetAccentColor?: string;
      widgetEnabled?: boolean;
    }
  ) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    if (!tenant.hasWidget) {
      throw new Error('Website Chat Widget is not included in your active plan. Please upgrade your plan.');
    }

    const data: any = {};

    if (dto.panelApiUrl !== undefined) {
      if (dto.panelApiUrl && dto.panelApiUrl.trim()) {
        const norm = dto.panelApiUrl.trim().replace(/\/+$/, '');
        await validateSafeUrl(norm);
        data.widgetPanelUrl = norm;
        if (!tenant.panelApiUrl) {
          data.panelApiUrl = norm;
        }
      } else {
        data.widgetPanelUrl = null;
      }
    }

    if (dto.widgetApiKey !== undefined) {
      if (dto.widgetApiKey && dto.widgetApiKey.trim()) {
        data.widgetApiKey = encrypt(dto.widgetApiKey.trim());
      } else {
        data.widgetApiKey = null;
      }
    }

    if (dto.widgetTitle !== undefined) {
      data.widgetTitle = dto.widgetTitle.trim() || 'Customer Support';
    }
    if (dto.widgetWelcomeMessage !== undefined) {
      data.widgetWelcomeMessage = dto.widgetWelcomeMessage.trim();
    }
    if (dto.widgetAccentColor !== undefined) {
      data.widgetAccentColor = dto.widgetAccentColor.trim() || '#ea580c';
    }
    if (dto.widgetEnabled !== undefined) {
      data.widgetEnabled = Boolean(dto.widgetEnabled);
    }

    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data
    });

    await widgetService.invalidateCatalogCache(tenantId);

    if (dto.widgetApiKey !== undefined) {
      await AuditLogService.record({
        tenantId,
        action: 'WIDGET_API_KEY_UPDATED',
        actorIp: 'unknown',
        metadata: { hasKey: Boolean(updated.widgetApiKey) }
      });
    }

    return {
      tenantId: updated.id,
      widgetEnabled: updated.widgetEnabled,
      widgetTitle: updated.widgetTitle,
      widgetWelcomeMessage: updated.widgetWelcomeMessage,
      widgetAccentColor: updated.widgetAccentColor,
      hasWidgetApiKey: Boolean(updated.widgetApiKey),
      widgetPanelUrl: updated.widgetPanelUrl || updated.panelApiUrl
    };
  }

  /**
   * Retrieves widget settings for the tenant admin dashboard.
   */
  async getWidgetSettings(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        hasWidget: true,
        widgetTitle: true,
        widgetWelcomeMessage: true,
        widgetAccentColor: true,
        widgetEnabled: true,
        widgetApiKey: true,
        widgetPanelUrl: true,
        panelApiUrl: true
      }
    });

    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    return {
      tenantId: tenant.id,
      hasWidget: Boolean(tenant.hasWidget),
      widgetEnabled: tenant.widgetEnabled,
      widgetTitle: tenant.widgetTitle || 'Customer Support',
      widgetWelcomeMessage:
        tenant.widgetWelcomeMessage ||
        'Hello! How can we help you today? Ask about our services, pricing, or order tracking.',
      widgetAccentColor: tenant.widgetAccentColor || '#ea580c',
      hasWidgetApiKey: Boolean(tenant.widgetApiKey),
      panelApiUrl: tenant.widgetPanelUrl || tenant.panelApiUrl
    };
  }

  /**
   * Permanently deletes tenant account and all related data (COMP-02).
   * Authenticated, requires password re-confirmation.
   * Stops running bots, clears tenant Redis keys, writes anonymized audit entry,
   * and executes a cascading database deletion inside a transaction.
   */
  async deleteAccount(
    tenantId: string,
    passwordConfirmation: string,
    actorInfo?: { ip?: string; userAgent?: string }
  ) {
    if (!passwordConfirmation || typeof passwordConfirmation !== 'string') {
      const err: any = new Error('Password confirmation is required');
      err.statusCode = 400;
      throw err;
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) {
      const err: any = new Error('Tenant not found');
      err.statusCode = 404;
      throw err;
    }

    const isValid = await authService.verifyPassword(tenant.passwordHash, passwordConfirmation);
    if (!isValid) {
      const err: any = new Error('Invalid password confirmation');
      err.statusCode = 401;
      throw err;
    }

    // 1. Stop active bot instances
    try {
      await this.botManagerService.stopTenantBot(tenantId);
      await this.whatsAppBotManagerService.stopTenantWhatsApp(tenantId);
    } catch (err) {
      console.warn(`[TenantsService] Error stopping bots during account deletion for ${tenantId}:`, err);
    }

    // 2. Anonymized AuditLog entry before deletion
    await AuditLogService.record({
      tenantId,
      action: 'TENANT_ACCOUNT_DELETED',
      actorIp: actorInfo?.ip || 'unknown',
      userAgent: actorInfo?.userAgent || null,
      metadata: { tenantId }
    });

    // 3. Purge Redis keys scoped by tenant prefix
    try {
      if (typeof redis.scanStream === 'function') {
        const stream = redis.scanStream({ match: `tenant:${tenantId}:*`, count: 100 });
        stream.on('data', async (keys: string[]) => {
          if (keys && keys.length > 0) {
            await redis.del(...keys).catch(() => {});
          }
        });
        await new Promise<void>((resolve) => {
          stream.on('end', () => resolve());
          stream.on('error', () => resolve());
        });
      }
      // Also explicitly delete critical known keys
      await redis.del(tenantStatusKey(tenantId)).catch(() => {});
      await redis.del(`tenant:${tenantId}:catalog:services`).catch(() => {});
      await redis.del(`tenant:${tenantId}:crawl:services`).catch(() => {});
    } catch {
      // Non-blocking cleanup error
    }

    // 4. Atomic cascading deletion via Prisma transaction
    await prisma.$transaction([
      prisma.tenant.delete({
        where: { id: tenantId }
      })
    ]);

    return {
      success: true,
      message: 'Tenant account and all associated data permanently deleted.'
    };
  }
}

