import { prisma } from '../common/database/prisma.js';
import { redis } from '../common/redis/redis.js';
import { decrypt } from '../common/crypto/encryption.js';
import { SmmProviderClient, SmmService } from '../smm-core/smm-client.js';
import { PanelCrawlerService } from '../crawler/panel-crawler.service.js';
import { RuntimeLogService } from '../common/logging/runtime-log.service.js';
import { AiAgentService } from '../ai-engine/ai-agent.service.js';

export interface WidgetPublicConfig {
  enabled: boolean;
  tenantId?: string;
  title?: string;
  welcome?: string;
  accent?: string;
  hasCatalogKey?: boolean;
}

export interface ChatReplyResult {
  reply: string;
  sessionId: string;
}

export class WidgetService {
  private inFlightCatalogFetches = new Map<string, Promise<SmmService[]>>();

  constructor(private panelCrawlerService: PanelCrawlerService = new PanelCrawlerService()) {}

  /**
   * Fetches public widget styling and branding configuration for a tenant.
   * Never leaks API keys or sensitive tenant credentials.
   */
  async getTenantWidgetConfig(tenantId: string): Promise<WidgetPublicConfig> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        subscriptionStatus: true,
        widgetTitle: true,
        widgetWelcomeMessage: true,
        widgetAccentColor: true,
        widgetEnabled: true,
        widgetApiKey: true,
        panelApiUrl: true
      }
    });

    if (!tenant || tenant.subscriptionStatus !== 'ACTIVE' || !tenant.widgetEnabled) {
      return { enabled: false };
    }

    return {
      enabled: true,
      tenantId: tenant.id,
      title: tenant.widgetTitle || 'Customer Support',
      welcome:
        tenant.widgetWelcomeMessage ||
        'Hello! How can we help you today? Ask about our services, pricing, or order tracking.',
      accent: tenant.widgetAccentColor || '#ea580c',
      hasCatalogKey: Boolean(tenant.widgetApiKey)
    };
  }

  /**
   * Retrieves the SMM service catalog with Redis caching, TTL 900s,
   * error resilience, and in-flight promise deduplication to prevent cache stampedes.
   */
  async getCachedServices(tenantId: string, panelApiUrl: string, catalogKey: string): Promise<SmmService[]> {
    const cacheKey = `tenant:${tenantId}:catalog:services`;

    // 1. Try reading from Redis cache
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            return parsed;
          }
        } catch {
          console.warn(`[WidgetService] Invalid cached JSON in Redis for ${cacheKey}`);
        }
      }
    } catch (err) {
      console.warn(`[WidgetService] Redis get failed for ${cacheKey}, continuing to live fetch:`, err);
    }

    // 2. Prevent cache stampede: Deduplicate in-flight fetch for the same tenant
    let inFlight = this.inFlightCatalogFetches.get(tenantId);
    if (!inFlight) {
      inFlight = (async () => {
        const client = new SmmProviderClient(panelApiUrl, catalogKey);
        const liveServices = await client.getServices();
        if (Array.isArray(liveServices) && liveServices.length > 0) {
          try {
            await redis.setex(cacheKey, 900, JSON.stringify(liveServices));
          } catch (err) {
            console.warn(`[WidgetService] Redis setex failed for ${cacheKey}:`, err);
          }
        }
        return liveServices;
      })().finally(() => {
        this.inFlightCatalogFetches.delete(tenantId);
      });

      this.inFlightCatalogFetches.set(tenantId, inFlight);
    }

    return inFlight;
  }

  /**
   * Invalidates cached services for a tenant when panel settings or keys change.
   */
  async invalidateCatalogCache(tenantId: string): Promise<void> {
    const cacheKey = `tenant:${tenantId}:catalog:services`;
    try {
      await redis.del(cacheKey);
    } catch (err) {
      console.warn(`[WidgetService] Redis del failed for ${cacheKey}:`, err);
    }
  }

  /**
   * Handles incoming public chat messages from website visitors.
   * Public visitors do NOT need an API key. Uses the tenant's admin-configured demo/catalog key.
   */
  async handleChatMessage(tenantId: string, sessionId: string, rawMessage: string): Promise<ChatReplyResult> {
    const message = (rawMessage || '').trim();
    if (!message) {
      throw new Error('Message cannot be empty.');
    }
    if (message.length > 2000) {
      throw new Error('Message exceeds 2000 characters limit.');
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant || tenant.subscriptionStatus !== 'ACTIVE' || !tenant.widgetEnabled) {
      return {
        sessionId,
        reply: '⚠️ Support chat is currently unavailable for this panel. Please contact the administrator.'
      };
    }

    // 1. Ensure WebChatSession exists
    await prisma.webChatSession.upsert({
      where: {
        tenantId_sessionId: {
          tenantId,
          sessionId
        }
      },
      update: {},
      create: {
        tenantId,
        sessionId
      }
    });

    // 2. Persist visitor's message
    await prisma.webChatMessage.create({
      data: {
        sessionId,
        role: 'user',
        content: message
      }
    });

    // 3. Resolve Admin's Catalog API Key (AES-256 decrypted)
    let catalogKey: string | null = null;
    if (tenant.widgetApiKey) {
      try {
        catalogKey = decrypt(tenant.widgetApiKey);
      } catch {
        catalogKey = tenant.widgetApiKey;
      }
    }

    let reply = '';

    // 4. AI-Powered Generation (with catalog grounding, tool calling, and Redis caching)
    try {
      const recentMessages = await prisma.webChatMessage.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'desc' },
        take: 6
      });

      const history = recentMessages.reverse().map((m) => ({
        role: (m.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
        content: m.content
      }));

      reply = await AiAgentService.getInstance().generateReply({
        tenantId,
        message,
        channel: 'widget',
        sessionId,
        history,
        tenant
      });
    } catch (err: any) {
      console.warn(`[WidgetService] AI generation error, falling back to deterministic matching:`, err?.message || err);
    }

    const lower = message.toLowerCase();
    const orderMatch =
      message.match(/(?:(?:order|status|track)\s*#?\s*(\d+))/i) ||
      message.match(/^\/status\s*(\d+)/i) ||
      (message.startsWith('#') && message.substring(1).match(/^(\d+)$/));

    // 5. Fallback rule-based matching if AI returned empty
    if (!reply) {

    if (orderMatch && orderMatch[1]) {
      const orderId = orderMatch[1];
      if (tenant.panelApiUrl && catalogKey) {
        try {
          const client = new SmmProviderClient(tenant.panelApiUrl, catalogKey);
          const order = await client.getOrderStatus(orderId);
          reply =
            `📦 **Order #${orderId} Details:**\n\n` +
            `• **Status:** ${order.status || 'Pending'}\n` +
            `• **Start Count:** ${order.start_count ?? 'N/A'}\n` +
            `• **Remains:** ${order.remains ?? 'N/A'}\n` +
            `• **Charge:** ${order.charge ? `${order.charge} ${order.currency || ''}` : 'N/A'}`;
        } catch (err: any) {
          reply = `❌ Could not retrieve status for Order #${orderId}: ${err.message || 'Please check order number.'}`;
        }
      } else {
        reply = `📦 To track **Order #${orderId}**, please reach out to our staff or check your panel account directly.`;
      }
    }

    // Intent B: Catalog & Service Pricing Search
    else if (
      lower.includes('service') ||
      lower.includes('price') ||
      lower.includes('pricing') ||
      lower.includes('rate') ||
      lower.includes('cost') ||
      lower.includes('catalog') ||
      lower.includes('instagram') ||
      lower.includes('youtube') ||
      lower.includes('tiktok') ||
      lower.includes('telegram') ||
      lower.includes('twitter') ||
      lower.includes('facebook') ||
      lower.includes('spotify') ||
      lower.includes('follower') ||
      lower.includes('view') ||
      lower.includes('like')
    ) {
      if (tenant.panelApiUrl && catalogKey) {
        try {
          const services = await this.getCachedServices(tenantId, tenant.panelApiUrl, catalogKey);

          // Extract search keywords (excluding generic question words)
          const searchTokens = lower
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter((w) => !['show', 'me', 'the', 'what', 'are', 'your', 'list', 'all', 'how', 'much', 'for', 'can', 'i', 'get'].includes(w));

          let filtered = services;
          if (searchTokens.length > 0) {
            filtered = services.filter((s) => {
              const nameLower = (s.name || '').toLowerCase();
              const catLower = (s.category || '').toLowerCase();
              return searchTokens.some((t) => nameLower.includes(t) || catLower.includes(t));
            });
          }

          const topResults = filtered.slice(0, 6);
          if (topResults.length > 0) {
            reply = formatPublicServicesList(topResults, filtered.length);
          } else {
            reply = `🔍 No matching services found for "${message}". Try searching with platform name like **Instagram**, **YouTube**, **Telegram**, or **Followers**.`;
          }
        } catch (err: any) {
          reply = `⚡ Our full service catalog with live prices is available on our panel dashboard. (${err.message || 'Error fetching rates'})`;
        }
      } else {
        // Fallback to cached crawler data if catalog key not yet configured
        const crawlerReply = await PanelCrawlerService.getCachedReply(tenantId, message);
        reply =
          crawlerReply ||
          `⚡ We offer instant social media growth services with competitive rates! Visit our main panel at [${tenant.panelApiUrl || 'our website'}] to view the complete catalog.`;
      }
    }

    // Intent C: Greetings
    else if (/^(hi|hello|hey|hola|namaste|good\s*(morning|evening|afternoon)|start)/i.test(lower)) {
      reply =
        `👋 **Hello! Welcome to our 24/7 Support Assistant.**\n\n` +
        `Here is what you can ask me:\n` +
        `• 🔍 **Search Services & Rates:** (e.g. *"Instagram followers"*, *"YouTube views"*, *"services"*)\n` +
        `• 📦 **Track an Order:** (e.g. *"status 12345"* or *"track 12345"*)\n` +
        `• 💬 **Ask any question** about delivery times, refunds, and guarantees!`;
    }

    // Intent D: General Questions (Crawler Knowledge Base)
    else {
      const cached = await PanelCrawlerService.getCachedReply(tenantId, message);
      if (cached) {
        reply = cached;
      } else {
        reply =
          `Thank you for reaching out! A customer support representative has been alerted. ` +
          `In the meantime, you can search our catalog by typing any service name (e.g., **Instagram**, **YouTube**, **Services**) ` +
          `or track an existing order with **status <order_id>**.`;
      }
    }
  }

    // 6. Persist Assistant Reply
    await prisma.webChatMessage.create({
      data: {
        sessionId,
        role: 'assistant',
        content: reply
      }
    });

    // Record live telemetry for widget chat
    RuntimeLogService.record({
      tenantId,
      channel: 'widget',
      level: 'info',
      event: 'WIDGET_CHAT_MESSAGE',
      message: `Visitor sent: "${message.slice(0, 50)}${message.length > 50 ? '...' : ''}"`,
      details: {
        sessionId,
        intent: orderMatch ? 'ORDER_TRACKING' : (lower.includes('service') ? 'CATALOG_QUERY' : 'GENERAL_QUERY'),
        replyPreview: reply.slice(0, 80)
      }
    }).catch(() => {});

    return {
      sessionId,
      reply
    };
  }

  /**
   * Retrieves persistent conversation history for a visitor's session.
   */
  async getChatHistory(tenantId: string, sessionId: string, limit = 40) {
    const messages = await prisma.webChatMessage.findMany({
      where: {
        session: {
          tenantId,
          sessionId
        }
      },
      orderBy: {
        createdAt: 'asc'
      },
      take: limit
    });

    return {
      sessionId,
      history: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt
      }))
    };
  }
}

/**
 * Formats a list of SMM services into a clean, mobile-responsive markdown card list.
 */
function formatPublicServicesList(services: SmmService[], totalCount: number): string {
  let text = `⚡ **Live Service Rates (${services.length}${totalCount > services.length ? ` of ${totalCount}` : ''}):**\n\n`;

  for (const s of services) {
    const rate = s.rate !== undefined && s.rate !== null ? `$${parseFloat(String(s.rate)).toFixed(2)}` : 'N/A';
    const minMax = s.min && s.max ? ` (Min: ${s.min} | Max: ${s.max})` : '';
    text += `• **[ID: ${s.service}]** ${s.name}\n  💰 **Rate:** ${rate} per 1k${minMax}\n\n`;
  }

  if (totalCount > services.length) {
    text += `_Showing top ${services.length} matches. Type a more specific keyword to narrow down rates._`;
  }

  return text.trim();
}

export const widgetService = new WidgetService();
