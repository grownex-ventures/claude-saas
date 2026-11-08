import { proto, WASocket } from '@whiskeysockets/baileys';
import { prisma } from '../common/database/prisma.js';
import { redis } from '../common/redis/redis.js';
import { encrypt, decrypt } from '../common/crypto/encryption.js';
import { PanelCrawlerService } from '../crawler/panel-crawler.service.js';
import { SmmProviderClient } from '../smm-core/smm-client.js';
import { WhatsAppService } from './whatsapp.service.js';
import { formatCurrencyAmount, formatWhatsAppServicesList, formatWhatsAppMessage } from './formatter.js';
import { AiAgentService } from '../ai-engine/ai-agent.service.js';

export function extractMessageText(message: proto.IMessage | null | undefined): string {
  if (!message) return '';
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    ''
  ).trim();
}

export function cleanJid(jid: string): string {
  if (!jid) return '';
  return jid.replace(/:[0-9]+@/, '@');
}

export class WhatsAppBotManagerService {
  private static instance: WhatsAppBotManagerService;
  private activeInstances = new Map<string, WhatsAppService>();

  constructor(private panelCrawlerService: PanelCrawlerService = new PanelCrawlerService()) {
    if (WhatsAppBotManagerService.instance) {
      return WhatsAppBotManagerService.instance;
    }
    WhatsAppBotManagerService.instance = this;
  }

  public static getInstance(panelCrawlerService?: PanelCrawlerService): WhatsAppBotManagerService {
    if (!WhatsAppBotManagerService.instance) {
      WhatsAppBotManagerService.instance = new WhatsAppBotManagerService(panelCrawlerService);
    }
    return WhatsAppBotManagerService.instance;
  }

  /**
   * Initializes all active WhatsApp bots on application bootstrap.
   */
  async onModuleInit(): Promise<void> {
    const activeTenants = await prisma.tenant.findMany({
      where: {
        subscriptionStatus: 'ACTIVE',
        whatsAppEnabled: true,
        hasWhatsapp: true
      }
    });

    for (const tenant of activeTenants) {
      try {
        await this.startTenantWhatsApp(tenant.id, tenant.whatsAppPhoneNumber);
      } catch (err: any) {
        console.error(`[WhatsAppManager] Failed to start bot for tenant ${tenant.id}:`, err?.message);
      }
    }
  }

  /**
   * Graceful shutdown of all active WhatsApp instances.
   */
  async onModuleDestroy(): Promise<void> {
    const tenantIds = Array.from(this.activeInstances.keys());
    for (const tenantId of tenantIds) {
      await this.stopTenantWhatsApp(tenantId);
    }
  }

  /**
   * Gets or initializes a tenant's WhatsApp service.
   */
  async startTenantWhatsApp(
    tenantId: string,
    phoneNumber?: string | null,
    mode: 'qr' | 'pairing' = 'qr',
    forceRestart = false
  ): Promise<WhatsAppService> {
    const existing = this.activeInstances.get(tenantId);
    if (!forceRestart && existing && (existing.isConnected() || existing.connectionStatus === 'connecting')) {
      return existing;
    }

    if (existing) {
      await existing.stop();
      this.activeInstances.delete(tenantId);
    }

    const service = new WhatsAppService({
      tenantId,
      phoneNumber: mode === 'pairing' ? (phoneNumber || null) : null,
      mode
    });

    if (forceRestart) {
      service.clearAuth();
    }

    service.setMessageListener(async (sock, msg) => {
      await this.handleIncomingMessage(tenantId, sock, msg, service);
    });

    this.activeInstances.set(tenantId, service);
    await service.start();
    return service;
  }

  /**
   * Stops a tenant's WhatsApp instance.
   */
  async stopTenantWhatsApp(tenantId: string): Promise<void> {
    const service = this.activeInstances.get(tenantId);
    if (service) {
      await service.stop();
      this.activeInstances.delete(tenantId);
    }
  }

  /**
   * Disconnects a tenant's WhatsApp instance and permanently deletes auth files on disk.
   */
  async deleteSession(tenantId: string): Promise<void> {
    const service = this.activeInstances.get(tenantId);
    if (service) {
      await service.stop();
      service.clearAuth();
      this.activeInstances.delete(tenantId);
    } else {
      const tempService = new WhatsAppService({ tenantId });
      tempService.clearAuth();
    }
  }

  async deleteTenantWhatsApp(tenantId: string): Promise<void> {
    return this.deleteSession(tenantId);
  }

  /**
   * Returns an active WhatsAppService instance.
   */
  getService(tenantId: string): WhatsAppService | undefined {
    return this.activeInstances.get(tenantId);
  }

  /**
   * Processes incoming customer WhatsApp messages.
   */
  private async handleIncomingMessage(
    tenantId: string,
    _sock: WASocket,
    msg: proto.IWebMessageInfo,
    service: WhatsAppService
  ): Promise<void> {
    if (!msg.key || !msg.key.remoteJid || !msg.message) return;
    const senderJid = cleanJid(msg.key.remoteJid);
    const text = extractMessageText(msg.message);
    if (!text) return;

    // Fetch tenant details for panel URL
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        hasWhatsapp: true,
        whatsappPanelUrl: true,
        panelApiUrl: true
      }
    });

    if (!tenant || !tenant.hasWhatsapp) {
      await service.sendReply(senderJid, '⚠️ This WhatsApp support line is currently inactive. Please contact the administrator.');
      return;
    }

    const panelApiUrl = tenant.whatsappPanelUrl || tenant.panelApiUrl;
    if (!panelApiUrl) {
      await service.sendReply(senderJid, '⚠️ This support line is currently unconfigured. Please contact panel admin.');
      return;
    }

    // Auto-upsert customer session for strict per-user multi-tenant isolation
    const phoneDigits = senderJid.replace(/[^0-9]/g, '');
    const session = await prisma.whatsAppSession.upsert({
      where: {
        tenantId_whatsappJid: {
          tenantId,
          whatsappJid: senderJid
        }
      },
      update: {
        phoneNumber: phoneDigits
      },
      create: {
        tenantId,
        whatsappJid: senderJid,
        phoneNumber: phoneDigits
      }
    });

    // Persist incoming customer message to isolated chat history
    await prisma.whatsAppChatMessage.create({
      data: {
        tenantId,
        whatsappJid: senderJid,
        role: 'user',
        content: text
      }
    });

    // Helper to persist assistant response and send via WhatsApp socket
    const sendAndRecordReply = async (replyText: string) => {
      const formatted = formatWhatsAppMessage(replyText);
      await prisma.whatsAppChatMessage.create({
        data: {
          tenantId,
          whatsappJid: senderJid,
          role: 'assistant',
          content: replyText
        }
      });
      await service.sendReply(senderJid, formatted);
    };

    // 1. Detect API Key Authentication: /setkey <KEY>, /login <KEY>, or raw hex token
    const isDirectApiKey = /^[a-f0-9]{16,128}$/i.test(text);
    const isSetKeyCommand = text.startsWith('/setkey') || text.startsWith('/login');

    if (isDirectApiKey || isSetKeyCommand) {
      const rawKey = isDirectApiKey ? text : text.split(/\s+/)[1]?.trim();

      // CWE-532: Auto-delete raw API key message from chat for privacy
      if (msg.key) {
        await service.deleteMessage(senderJid, msg.key);
      }

      if (!rawKey) {
        await sendAndRecordReply('⚠️ Usage: */setkey <YOUR_PANEL_API_KEY>*');
        return;
      }

      // Live verification with SMM Panel (SSRF protected)
      const smmClient = new SmmProviderClient(panelApiUrl, rawKey);
      let balanceData: any;
      try {
        balanceData = await smmClient.getBalance();
      } catch (err: any) {
        await sendAndRecordReply(
          `❌ *Invalid API Key:* Could not verify credentials with panel.\n\n_Reason: ${err.message}_`
        );
        return;
      }

      // Encrypt and persist session
      const encryptedKey = encrypt(rawKey);

      await prisma.whatsAppSession.update({
        where: {
          tenantId_whatsappJid: {
            tenantId,
            whatsappJid: senderJid
          }
        },
        data: {
          phoneNumber: phoneDigits,
          userPanelKey: encryptedKey
        }
      });

      const currency = balanceData.currency || 'USD';
      const balance = balanceData.balance ?? '0.00';

      const welcome =
        `🎉 *Account Connected Successfully!*\n\n` +
        `💰 *Your Balance:* *${formatCurrencyAmount(balance, currency)}*\n\n` +
        `🔒 _Your secret API key was automatically wiped from chat for safety._\n\n` +
        `⚡ *Available Commands:*\n` +
        `• */balance* — Check wallet funds\n` +
        `• */services <keyword>* — Search services\n` +
        `• */status <order_id>* — Track order\n` +
        `• */help* — Show commands\n` +
        `• */logout* — Unlink account\n\n` +
        `💬 _Or send any question to get instant support!_`;

      await sendAndRecordReply(welcome);
      return;
    }

    // 2. /logout command
    if (text === '/logout') {
      await prisma.whatsAppSession.updateMany({
        where: { tenantId, whatsappJid: senderJid },
        data: { userPanelKey: null }
      });
      await sendAndRecordReply(
        '👋 *Logged Out:* Your account has been disconnected and your API key unlinked. Send your API key anytime to reconnect.'
      );
      return;
    }

    // 3. /help or /start command
    if (text === '/help' || text === '/start') {
      const helpMsg =
        `📖 *WhatsApp Support Commands:*\n\n` +
        `• */setkey <API_KEY>* — Connect your panel account\n` +
        `• */balance* — Check current funds\n` +
        `• */services <keyword>* — Search services & rates\n` +
        `• */status <order_id>* — Check order status\n` +
        `• */logout* — Disconnect account\n\n` +
        `💬 _You can also ask questions naturally about services or orders!_`;
      await sendAndRecordReply(helpMsg);
      return;
    }

    // 4. /balance command
    if (text === '/balance') {
      if (!session || !session.userPanelKey) {
        await sendAndRecordReply(
          '🔒 *Account Not Linked:* Please connect your account first via */setkey <YOUR_API_KEY>*'
        );
        return;
      }

      let rawKey = '';
      try {
        rawKey = decrypt(session.userPanelKey);
      } catch {
        await sendAndRecordReply(
          '⚠️ *API Key Error:* Your saved API key could not be decrypted. Please reconnect your account using */setkey <YOUR_API_KEY>*'
        );
        return;
      }

      try {
        const client = new SmmProviderClient(panelApiUrl, rawKey);
        const data = await client.getBalance();
        await sendAndRecordReply(
          `💰 *Account Balance:*\n\nAvailable Funds: *${formatCurrencyAmount(data.balance, data.currency)}*`
        );
      } catch (err: any) {
        await sendAndRecordReply(`❌ Failed to fetch balance: ${err.message}`);
      }
      return;
    }

    // 5. /services <keyword>
    if (text.startsWith('/services')) {
      const keyword = text.replace('/services', '').trim().toLowerCase();
      let rawKey = '';
      if (session && session.userPanelKey) {
        try {
          rawKey = decrypt(session.userPanelKey);
        } catch {
          await sendAndRecordReply(
            '⚠️ *API Key Error:* Your saved API key could not be decrypted. Please reconnect your account using */setkey <YOUR_API_KEY>*'
          );
          return;
        }
      }

      try {
        const client = new SmmProviderClient(panelApiUrl, rawKey);
        const allServices = await client.getServices();
        if (Array.isArray(allServices) && allServices.length > 0) {
          await redis.setex(`tenant:${tenantId}:crawl:services`, 300, JSON.stringify(allServices)).catch(() => {});
        }
        const filtered = keyword
          ? allServices.filter((s) => {
              const idStr = String(s.service || '');
              return (
                idStr === keyword ||
                idStr.includes(keyword) ||
                s.name.toLowerCase().includes(keyword) ||
                (s.category && s.category.toLowerCase().includes(keyword))
              );
            }).slice(0, 8)
          : allServices.slice(0, 8);

        const cardText = formatWhatsAppServicesList(filtered);
        await sendAndRecordReply(cardText);
      } catch (err: any) {
        await sendAndRecordReply(`❌ Failed to fetch services: ${err.message}`);
      }
      return;
    }

    // 6. /status <orderId>
    if (text.startsWith('/status')) {
      const orderId = text.split(/\s+/)[1]?.trim();
      if (!orderId) {
        await sendAndRecordReply('Usage: */status <order_id>*');
        return;
      }

      if (!session || !session.userPanelKey) {
        await sendAndRecordReply('🔒 Please link your account first via */setkey <YOUR_API_KEY>*');
        return;
      }

      let rawKey = '';
      try {
        rawKey = decrypt(session.userPanelKey);
      } catch {
        await sendAndRecordReply(
          '⚠️ *API Key Error:* Your saved API key could not be decrypted. Please reconnect your account using */setkey <YOUR_API_KEY>*'
        );
        return;
      }

      try {
        const client = new SmmProviderClient(panelApiUrl, rawKey);
        const status = await client.getOrderStatus(orderId);
        const reply =
          `📦 *Order #${orderId} Status:*\n\n` +
          `• *Status:* ${status.status || 'Unknown'}\n` +
          `• *Start Count:* ${status.start_count ?? 'N/A'}\n` +
          `• *Remains:* ${status.remains ?? 'N/A'}\n` +
          `• *Charge:* ${status.charge ? `${status.charge} ${status.currency || ''}` : 'N/A'}`;
        await sendAndRecordReply(reply);
      } catch (err: any) {
        await sendAndRecordReply(`❌ Failed to check order: ${err.message}`);
      }
      return;
    }

    // Check if conversation was taken over by a human operator
    try {
      if (session) {
        const mode = await redis.get(`conv:status:${session.id}`);
        if (mode === 'human') {
          // Live operator is handling this chat; suppress automated AI reply
          return;
        }
      }
    } catch {}

    // 7. General inquiries (AI Support Agent with recent conversation history)
    try {
      const dbHistory = await prisma.whatsAppChatMessage.findMany({
        where: { tenantId, whatsappJid: senderJid },
        orderBy: { createdAt: 'desc' },
        take: 6
      });
      const history = dbHistory.reverse().map((h) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content
      }));

      const reply = await AiAgentService.getInstance().generateReply({
        tenantId,
        message: text,
        channel: 'whatsapp',
        userId: senderJid,
        history
      });
      await sendAndRecordReply(reply);
    } catch (err: any) {
      console.warn(`[WhatsAppBotManager] AI reply error for tenant ${tenantId}:`, err?.message || err);
      const fallback = `Thank you for your message. An agent is reviewing your query. You can check order status with /status <order_id> or view services with /services.`;
      await sendAndRecordReply(fallback);
    }
  }
}
