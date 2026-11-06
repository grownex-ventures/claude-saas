import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { prisma } from '../common/database/prisma.js';
import { redis } from '../common/redis/redis.js';
import { tenantStatusKey } from '../common/redis/keys.js';
import { BotManagerService } from '../bot-engine/bot-manager.service.js';
import { WhatsAppBotManagerService } from '../whatsapp-engine/whatsapp-bot-manager.service.js';
import { getAdminJwtSecret } from './admin.guard.js';
import { settingsService } from '../common/settings/settings.service.js';
import { AiProviderClient } from '../ai-engine/ai-provider.client.js';
import { emailService } from '../common/email/email.service.js';
import { purgeTenantResources } from '../tenants/tenants.service.js';

export interface AdminLoginDto {
  email: string;
  password: string;
}

export interface AdminSetupDto {
  email: string;
  password: string;
  name?: string;
}

export class AdminService {
  private static instance: AdminService;
  private botManagerService: BotManagerService = BotManagerService.getInstance();
  private whatsAppBotManagerService: WhatsAppBotManagerService = WhatsAppBotManagerService.getInstance();

  private constructor() {}

  setBotManagerService(service: BotManagerService): void {
    this.botManagerService = service;
  }

  setWhatsAppBotManagerService(service: WhatsAppBotManagerService): void {
    this.whatsAppBotManagerService = service;
  }

  static getInstance(): AdminService {
    if (!AdminService.instance) {
      AdminService.instance = new AdminService();
    }
    return AdminService.instance;
  }

  /**
   * Check if the platform has an admin account initialized
   */
  async getSetupStatus(): Promise<{ hasAdmin: boolean; count: number }> {
    const count = await prisma.adminUser.count();
    return {
      hasAdmin: count > 0,
      count
    };
  }

  /**
   * Initial Setup Wizard: creates the first super admin account
   */
  async setupInitialAdmin(dto: AdminSetupDto): Promise<{ token: string; admin: { id: string; email: string; name: string } }> {
    const count = await prisma.adminUser.count();
    if (count > 0) {
      const err: any = new Error('Admin setup has already been completed. Please use /admin/login');
      err.statusCode = 400;
      throw err;
    }

    if (!dto.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dto.email.trim())) {
      const err: any = new Error('A valid admin email is required');
      err.statusCode = 400;
      throw err;
    }

    if (!dto.password || dto.password.length < 8) {
      const err: any = new Error('Admin password must be at least 8 characters');
      err.statusCode = 400;
      throw err;
    }

    const passwordHash = await argon2.hash(dto.password);
    const admin = await prisma.adminUser.create({
      data: {
        email: dto.email.trim().toLowerCase(),
        passwordHash,
        name: dto.name?.trim() || 'Super Admin',
        lastLoginAt: new Date()
      }
    });

    const token = this.generateAdminToken(admin.id, admin.email, admin.name);

    return {
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name
      }
    };
  }

  /**
   * Authenticate Super Admin
   */
  async login(dto: AdminLoginDto): Promise<{ token: string; admin: { id: string; email: string; name: string } }> {
    if (!dto.email || !dto.password) {
      const err: any = new Error('Email and password are required');
      err.statusCode = 400;
      throw err;
    }

    const admin = await prisma.adminUser.findUnique({
      where: { email: dto.email.trim().toLowerCase() }
    });

    if (!admin) {
      const err: any = new Error('Invalid email or password');
      err.statusCode = 401;
      throw err;
    }

    const isValid = await argon2.verify(admin.passwordHash, dto.password);
    if (!isValid) {
      const err: any = new Error('Invalid email or password');
      err.statusCode = 401;
      throw err;
    }

    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() }
    });

    const token = this.generateAdminToken(admin.id, admin.email, admin.name);

    return {
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name
      }
    };
  }

  /**
   * Issues a signed Admin JWT (12 hour expiration)
   */
  generateAdminToken(id: string, email: string, name: string): string {
    const secret = getAdminJwtSecret();
    return jwt.sign(
      { id, email, name, role: 'superadmin' },
      secret,
      { expiresIn: '12h' }
    );
  }

  /**
   * System Telemetry & Operational Health
   */
  async getTelemetry(): Promise<Record<string, any>> {
    let dbStatus = 'healthy';
    let redisStatus = 'healthy';

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'unhealthy';
    }

    try {
      const pong = await redis.ping();
      if (pong !== 'PONG') redisStatus = 'unhealthy';
    } catch {
      redisStatus = 'unhealthy';
    }

    const [
      totalTenants,
      activeSubscriptions,
      expiredSubscriptions,
      totalLeads,
      newLeads,
      telegramSessions,
      whatsAppSessions,
      webChatSessions,
      totalWebMessages
    ] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { subscriptionStatus: 'ACTIVE' } }),
      prisma.tenant.count({ where: { subscriptionStatus: 'EXPIRED' } }),
      prisma.leadRequest.count(),
      prisma.leadRequest.count({ where: { status: 'NEW' } }),
      prisma.botUserSession.count(),
      prisma.whatsAppSession.count(),
      prisma.webChatSession.count(),
      prisma.webChatMessage.count()
    ]);

    return {
      health: {
        database: dbStatus,
        redis: redisStatus,
        nodeEnv: process.env.NODE_ENV || 'development',
        uptimeSeconds: Math.floor(process.uptime())
      },
      metrics: {
        totalTenants,
        activeSubscriptions,
        expiredSubscriptions,
        totalLeads,
        newLeads,
        sessions: {
          telegram: telegramSessions,
          whatsapp: whatsAppSessions,
          webChat: webChatSessions,
          totalWebMessages
        }
      }
    };
  }

  /**
   * Get paginated tenants with filtering and search
   */
  async getTenants(params: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ tenants: any[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.status && ['ACTIVE', 'INACTIVE', 'EXPIRED'].includes(params.status.toUpperCase())) {
      where.subscriptionStatus = params.status.toUpperCase();
    }

    if (params.search && params.search.trim()) {
      const q = params.search.trim();
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { panelApiUrl: { contains: q, mode: 'insensitive' } }
      ];
    }

    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          subscriptionStatus: true,
          botToken: true,
          panelApiUrl: true,
          telegramPanelUrl: true,
          whatsappPanelUrl: true,
          widgetPanelUrl: true,
          hasTelegram: true,
          hasWhatsapp: true,
          hasWidget: true,
          emailVerified: true,
          emailVerifiedAt: true,
          mfaEnabled: true,
          whatsAppEnabled: true,
          whatsAppPhoneNumber: true,
          widgetEnabled: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              endUserSessions: true,
              whatsAppSessions: true,
              webChatSessions: true
            }
          }
        }
      }),
      prisma.tenant.count({ where })
    ]);

    return {
      tenants: tenants.map((t) => ({
        ...t,
        hasBotToken: Boolean(t.botToken),
        botToken: t.botToken ? `${t.botToken.slice(0, 8)}...` : null
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Update tenant subscription status with Redis caching and channel bot lifecycle synchronization.
   * - ACTIVE: caches status with 3600s TTL; starts configured and entitled channels.
   * - INACTIVE / EXPIRED: caches status with 3600s TTL; stops Telegram and WhatsApp bots.
   * - Failures in Redis or bot startup do not roll back the database update.
   */
  async updateTenantSubscription(
    tenantId: string,
    status: 'ACTIVE' | 'INACTIVE' | 'EXPIRED'
  ): Promise<{
    id: string;
    email: string;
    subscriptionStatus: string;
    channelErrors?: string[];
    warnings?: string[];
  }> {
    // 1. Persist DB status
    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: { subscriptionStatus: status }
    });

    // 2. Cache status in Redis with 3,600s TTL using canonical helper
    try {
      await redis.set(tenantStatusKey(tenantId), status, 'EX', 3600);
    } catch (err: any) {
      console.warn(`[AdminService] Redis failure caching status for ${tenantId}:`, err?.message);
    }

    const channelErrors: string[] = [];

    // 3. Channel lifecycle transitions
    if (status === 'ACTIVE') {
      // Start only configured and entitled channels
      if (updated.hasTelegram && updated.botToken) {
        try {
          await this.botManagerService.startTenantBot({
            tenantId: updated.id,
            botToken: updated.botToken,
            panelApiUrl: updated.telegramPanelUrl || updated.panelApiUrl || '',
            subscriptionStatus: 'ACTIVE'
          });
        } catch (err: any) {
          const errMsg = `Telegram failed to start: ${err?.message || String(err)}`;
          console.error(`[AdminService] ${errMsg}`);
          channelErrors.push(errMsg);
        }
      }

      if (updated.hasWhatsapp && updated.whatsAppEnabled) {
        try {
          await this.whatsAppBotManagerService.startTenantWhatsApp(
            updated.id,
            updated.whatsAppPhoneNumber
          );
        } catch (err: any) {
          const errMsg = `WhatsApp failed to start: ${err?.message || String(err)}`;
          console.error(`[AdminService] ${errMsg}`);
          channelErrors.push(errMsg);
        }
      }
    } else {
      // INACTIVE or EXPIRED: Stop both Telegram and WhatsApp bots
      try {
        await this.botManagerService.stopTenantBot(tenantId);
      } catch (err: any) {
        console.warn(`[AdminService] Error stopping Telegram bot for ${tenantId}:`, err?.message);
      }

      try {
        await this.whatsAppBotManagerService.stopTenantWhatsApp(tenantId);
      } catch (err: any) {
        console.warn(`[AdminService] Error stopping WhatsApp bot for ${tenantId}:`, err?.message);
      }
    }

    const result: any = {
      id: updated.id,
      email: updated.email,
      subscriptionStatus: updated.subscriptionStatus
    };

    if (channelErrors.length > 0) {
      result.channelErrors = channelErrors;
      result.warnings = channelErrors;
    }

    return result;
  }

  /**
   * Update tenant independent channel plan entitlements (Telegram, WhatsApp, Widget)
   */
  async updateTenantPlans(
    tenantId: string,
    plans: { hasTelegram?: boolean; hasWhatsapp?: boolean; hasWidget?: boolean }
  ): Promise<any> {
    const data: any = {};
    if (typeof plans.hasTelegram === 'boolean') data.hasTelegram = plans.hasTelegram;
    if (typeof plans.hasWhatsapp === 'boolean') data.hasWhatsapp = plans.hasWhatsapp;
    if (typeof plans.hasWidget === 'boolean') data.hasWidget = plans.hasWidget;

    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data
    });
    return {
      id: updated.id,
      email: updated.email,
      hasTelegram: updated.hasTelegram,
      hasWhatsapp: updated.hasWhatsapp,
      hasWidget: updated.hasWidget
    };
  }

  /**
   * Grant free/complimentary agent access to a tenant without requiring payment.
   * Enables specified support channels (Telegram, WhatsApp, Widget), sets subscriptionStatus to ACTIVE,
   * configures expiration date (or lifetime ~100 years), refreshes Redis cache, and starts any configured bots.
   */
  async grantFreeAccess(
    tenantId: string,
    options: {
      hasTelegram?: boolean;
      hasWhatsapp?: boolean;
      hasWidget?: boolean;
      durationDays?: number;
    } = {}
  ): Promise<{
    id: string;
    email: string;
    subscriptionStatus: string;
    subscriptionExpiresAt: Date | null;
    hasTelegram: boolean;
    hasWhatsapp: boolean;
    hasWidget: boolean;
    channelErrors?: string[];
  }> {
    const days = typeof options.durationDays === 'number' && options.durationDays > 0 ? options.durationDays : 36500;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const hasTelegram = options.hasTelegram !== false;
    const hasWhatsapp = options.hasWhatsapp !== false;
    const hasWidget = options.hasWidget !== false;

    // 1. Update DB record
    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: expiresAt,
        hasTelegram,
        hasWhatsapp,
        hasWidget
      }
    });

    // 2. Set status in Redis with 3600s TTL using canonical helper
    try {
      await redis.set(tenantStatusKey(tenantId), 'ACTIVE', 'EX', 3600);
    } catch (err: any) {
      console.warn(`[AdminService] Redis failure caching status for ${tenantId}:`, err?.message);
    }

    const channelErrors: string[] = [];

    // 3. Channel lifecycle: Start any configured and entitled bots
    if (updated.hasTelegram && updated.botToken) {
      try {
        await this.botManagerService.startTenantBot({
          tenantId: updated.id,
          botToken: updated.botToken,
          panelApiUrl: updated.telegramPanelUrl || updated.panelApiUrl || '',
          subscriptionStatus: 'ACTIVE'
        });
      } catch (err: any) {
        channelErrors.push(`Telegram startup error: ${err?.message || err}`);
      }
    }

    if (updated.hasWhatsapp && updated.whatsAppEnabled) {
      try {
        await this.whatsAppBotManagerService.startTenantWhatsApp(
          updated.id,
          updated.whatsAppPhoneNumber
        );
      } catch (err: any) {
        channelErrors.push(`WhatsApp startup error: ${err?.message || err}`);
      }
    }

    // 4. Log audit trail
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: updated.id,
          action: 'ADMIN_GRANT_FREE_ACCESS',
          actorIp: '127.0.0.1',
          userAgent: 'SuperAdmin/Dashboard',
          metadata: {
            durationDays: options.durationDays || 'lifetime',
            expiresAt: expiresAt.toISOString(),
            hasTelegram,
            hasWhatsapp,
            hasWidget
          }
        }
      });
    } catch {}

    return {
      id: updated.id,
      email: updated.email,
      subscriptionStatus: updated.subscriptionStatus,
      subscriptionExpiresAt: updated.subscriptionExpiresAt,
      hasTelegram: updated.hasTelegram,
      hasWhatsapp: updated.hasWhatsapp,
      hasWidget: updated.hasWidget,
      channelErrors: channelErrors.length > 0 ? channelErrors : undefined
    };
  }

  /**
   * Toggle tenant email verification status
   */
  async toggleTenantEmailVerified(tenantId: string, verified: boolean): Promise<any> {
    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        emailVerified: verified,
        emailVerifiedAt: verified ? new Date() : null
      }
    });
    return { id: updated.id, emailVerified: updated.emailVerified };
  }

  /**
   * Impersonate Tenant: returns a valid 2-hour JWT token to log into /dashboard
   */
  async impersonateTenant(tenantId: string): Promise<{ token: string; tenant: { id: string; email: string } }> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, email: true }
    });

    if (!tenant) {
      const err: any = new Error('Tenant not found');
      err.statusCode = 404;
      throw err;
    }

    const secret = process.env.JWT_SECRET || 'fallback_secret_for_tests';
    const token = jwt.sign(
      { sub: tenant.id, email: tenant.email, role: 'tenant', impersonated: true },
      secret,
      { expiresIn: '2h' }
    );

    return {
      token,
      tenant
    };
  }

  /**
   * Permanently delete a tenant and cascading records with unified resource cleanup
   */
  async deleteTenant(tenantId: string): Promise<boolean> {
    await purgeTenantResources(tenantId);
    return true;
  }

  /**
   * Get landing leads
   */
  async getLeads(params: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ leads: any[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.status && ['NEW', 'CONTACTED', 'QUALIFIED', 'DISMISSED'].includes(params.status.toUpperCase())) {
      where.status = params.status.toUpperCase();
    }

    if (params.search && params.search.trim()) {
      const q = params.search.trim();
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { panelUrl: { contains: q, mode: 'insensitive' } },
        { contactNumber: { contains: q, mode: 'insensitive' } }
      ];
    }

    const [leads, total] = await Promise.all([
      prisma.leadRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.leadRequest.count({ where })
    ]);

    return {
      leads,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Update lead status and admin follow-up notes
   */
  async updateLead(leadId: string, data: { status?: string; notes?: string }): Promise<any> {
    const updateData: any = {};
    if (data.status && ['NEW', 'CONTACTED', 'QUALIFIED', 'DISMISSED'].includes(data.status.toUpperCase())) {
      updateData.status = data.status.toUpperCase();
    }
    if (data.notes !== undefined) {
      updateData.notes = data.notes;
    }

    return prisma.leadRequest.update({
      where: { id: leadId },
      data: updateData
    });
  }

  /**
   * Delete lead
   */
  async deleteLead(leadId: string): Promise<boolean> {
    await prisma.leadRequest.delete({
      where: { id: leadId }
    });
    return true;
  }

  /**
   * Get all system settings masked
   */
  async getSettings(): Promise<any> {
    return settingsService.getAllMasked();
  }

  /**
   * Batch update settings and hot-reload AI & Email engines
   */
  async updateSettings(updates: Record<string, string>): Promise<{ success: boolean; updatedKeys: string[] }> {
    const updatedKeys: string[] = [];

    const categoryMap: Record<string, { category: 'AI' | 'AUTH' | 'EMAIL' | 'SYSTEM'; isEncrypted: boolean }> = {
      AI_PROVIDER: { category: 'AI', isEncrypted: false },
      AI_MODEL: { category: 'AI', isEncrypted: false },
      AI_API_KEY: { category: 'AI', isEncrypted: true },
      AI_BASE_URL: { category: 'AI', isEncrypted: false },
      AI_TEMPERATURE: { category: 'AI', isEncrypted: false },
      AI_MAX_TOKENS: { category: 'AI', isEncrypted: false },
      AI_SYSTEM_PROMPT: { category: 'AI', isEncrypted: false },

      GOOGLE_CLIENT_ID: { category: 'AUTH', isEncrypted: false },
      GOOGLE_AUTH_ENABLED: { category: 'AUTH', isEncrypted: false },
      ALLOW_PUBLIC_SIGNUP: { category: 'AUTH', isEncrypted: false },
      REQUIRE_EMAIL_VERIFICATION: { category: 'AUTH', isEncrypted: false },

      SMTP_HOST: { category: 'EMAIL', isEncrypted: false },
      SMTP_PORT: { category: 'EMAIL', isEncrypted: false },
      SMTP_SECURE: { category: 'EMAIL', isEncrypted: false },
      SMTP_USER: { category: 'EMAIL', isEncrypted: false },
      SMTP_PASS: { category: 'EMAIL', isEncrypted: true },
      SMTP_FROM: { category: 'EMAIL', isEncrypted: false },

      PLATFORM_NAME: { category: 'SYSTEM', isEncrypted: false },
      MAINTENANCE_MODE: { category: 'SYSTEM', isEncrypted: false }
    };

    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === null) continue;
      // Do not overwrite secret if frontend submitted masked value
      if (value.includes('••••')) continue;

      const meta = categoryMap[key] || { category: 'SYSTEM', isEncrypted: false };
      await settingsService.set(key, String(value).trim(), meta.category, meta.isEncrypted);
      updatedKeys.push(key);
    }

    // Hot-reload AI Engine
    const aiProvider = await settingsService.get('AI_PROVIDER');
    const aiApiKey = await settingsService.get('AI_API_KEY');
    const aiModel = await settingsService.get('AI_MODEL');
    const aiBaseUrl = await settingsService.get('AI_BASE_URL');
    const aiTempStr = await settingsService.get('AI_TEMPERATURE');
    const aiMaxTokensStr = await settingsService.get('AI_MAX_TOKENS');

    AiProviderClient.getInstance().reloadConfig({
      provider: aiProvider || undefined,
      apiKey: aiApiKey || undefined,
      model: aiModel || undefined,
      baseUrl: aiBaseUrl || undefined,
      temperature: aiTempStr ? parseFloat(aiTempStr) : undefined,
      maxTokens: aiMaxTokensStr ? parseInt(aiMaxTokensStr, 10) : undefined
    });

    // Hot-reload Email Engine
    const smtpHost = await settingsService.get('SMTP_HOST');
    const smtpPort = await settingsService.get('SMTP_PORT');
    const smtpSecure = await settingsService.get('SMTP_SECURE');
    const smtpUser = await settingsService.get('SMTP_USER');
    const smtpPass = await settingsService.get('SMTP_PASS');
    const smtpFrom = await settingsService.get('SMTP_FROM');

    emailService.reloadConfig({
      host: smtpHost || undefined,
      port: smtpPort ? parseInt(smtpPort, 10) : undefined,
      secure: smtpSecure === 'true',
      user: smtpUser || undefined,
      pass: smtpPass || undefined,
      from: smtpFrom || undefined
    });

    return { success: true, updatedKeys };
  }

  /**
   * Run an immediate 1-token test prompt to verify AI credentials
   */
  async testAiConnection(params?: {
    provider?: string;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  }): Promise<{ success: boolean; latencyMs: number; sampleResponse: string; provider: string; model: string }> {
    const startTime = Date.now();
    let clientToUse: AiProviderClient;

    if (params && (params.provider || params.apiKey || params.model)) {
      // Ephemeral test client with user-tested draft params
      const currentApiKey = params.apiKey && !params.apiKey.includes('••••')
        ? params.apiKey
        : await settingsService.get('AI_API_KEY');

      clientToUse = new AiProviderClient({
        provider: params.provider || await settingsService.get('AI_PROVIDER', 'openai'),
        apiKey: currentApiKey,
        model: params.model || await settingsService.get('AI_MODEL', 'gpt-4o-mini'),
        baseUrl: params.baseUrl || await settingsService.get('AI_BASE_URL', '')
      });
    } else {
      clientToUse = AiProviderClient.getInstance();
    }

    try {
      const response = await clientToUse.generateCompletion({
        messages: [
          { role: 'system', content: 'You are a test ping responder. Reply in under 5 words.' },
          { role: 'user', content: 'Ping' }
        ],
        maxTokens: 10,
        temperature: 0.1
      });

      const latencyMs = Date.now() - startTime;
      return {
        success: true,
        latencyMs,
        sampleResponse: response.content || 'OK',
        provider: response.provider,
        model: response.model
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      return {
        success: false,
        latencyMs,
        sampleResponse: `AI Connection Failed: ${err.message}`,
        provider: params?.provider || 'unknown',
        model: params?.model || 'unknown'
      };
    }
  }

  /**
   * Dispatch a real test email to check SMTP delivery
   */
  async testEmailConnection(toEmail: string): Promise<{ success: boolean; message: string }> {
    if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail.trim())) {
      const err: any = new Error('A valid recipient email address is required');
      err.statusCode = 400;
      throw err;
    }

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #4f46e5; margin-bottom: 12px;">✅ YourSMMagent SMTP Connection Test</h2>
        <p style="color: #374151; font-size: 15px; line-height: 1.6;">
          Congratulations! Your SMTP email integration is properly configured and actively delivering transactional messages for <strong>YourSMMagent</strong>.
        </p>
        <p style="color: #6b7280; font-size: 13px; margin-top: 24px; border-top: 1px solid #f3f4f6; padding-top: 12px;">
          Timestamp: ${new Date().toISOString()} • Dispatched from Super Admin Control Center
        </p>
      </div>
    `;

    const delivered = await emailService.sendEmail({
      to: toEmail.trim(),
      subject: '✅ [YourSMMagent] SMTP Integration Test Successful',
      text: 'Congratulations! Your SMTP email integration is properly configured and actively delivering messages.',
      html
    });

    if (delivered) {
      return { success: true, message: `Test email successfully dispatched to ${toEmail}` };
    } else {
      return { success: false, message: `Failed to dispatch test email to ${toEmail}. Check SMTP credentials.` };
    }
  }

  /**
   * List all platform crypto invoices for admin oversight with fixed 2-decimal string amounts
   */
  async getInvoices(limit = 100): Promise<any[]> {
    const invoices = await prisma.paymentInvoice.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        tenant: {
          select: { id: true, email: true, subscriptionStatus: true }
        }
      }
    });

    return invoices.map((inv) => ({
      ...inv,
      amount: Number(inv.amount).toFixed(2)
    }));
  }

  /**
   * Manually approve / mark an invoice as paid (admin override)
   */
  async markInvoicePaid(orderId: string, adminId?: string): Promise<{ success: boolean; message: string }> {
    const { billingService } = await import('../billing/billing.service.js');
    return billingService.markInvoicePaidByAdmin(orderId, adminId);
  }
}

export const adminService = AdminService.getInstance();

