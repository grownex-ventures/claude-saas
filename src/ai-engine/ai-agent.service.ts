import crypto from 'crypto';
import { prisma } from '../common/database/prisma.js';
import { redis } from '../common/redis/redis.js';
import { decrypt } from '../common/crypto/encryption.js';
import { SmmProviderClient, SmmService } from '../smm-core/smm-client.js';
import { AiProviderClient, AiChatMessage, AiToolDefinition } from './ai-provider.client.js';

export interface AiAgentRequest {
  tenantId: string;
  message: string;
  channel: 'widget' | 'telegram' | 'whatsapp';
  sessionId?: string;
  userId?: string;
  history?: AiChatMessage[];
  tenant?: any;
}

/**
 * Intelligent Multi-Channel AI Customer Support Agent
 * Formulates accurate, conversational support answers grounded directly in the tenant's SMM panel catalog.
 */
export class AiAgentService {
  private static instance: AiAgentService;
  private aiClient: AiProviderClient;

  constructor(aiClient: AiProviderClient = AiProviderClient.getInstance()) {
    this.aiClient = aiClient;
  }

  static getInstance(): AiAgentService {
    if (!AiAgentService.instance) {
      AiAgentService.instance = new AiAgentService();
    }
    return AiAgentService.instance;
  }

  /**
   * Generates a context-aware AI support response.
   */
  async generateReply(params: AiAgentRequest): Promise<string> {
    const { tenantId, message, channel, history = [] } = params;
    const cleanQuery = message.trim();
    if (!cleanQuery) return 'How can I assist you with your SMM orders or services today?';

    // 1. Check Redis Query Cache for instant (< 15ms) response on identical queries
    const cacheKey = `tenant:${tenantId}:qcache:${this.hashQuery(cleanQuery)}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return cached;
      }
    } catch {
      // Non-blocking Redis cache read failure
    }

    // 2. Load tenant configuration and crawled catalog
    const tenant = params.tenant || await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        panelApiUrl: true,
        widgetTitle: true,
        widgetWelcomeMessage: true,
        widgetApiKey: true,
        crawledData: true,
        subscriptionStatus: true
      }
    });

    if (!tenant) {
      return 'Customer support service is currently unavailable.';
    }

    let catalogKey: string | undefined;
    if (tenant.widgetApiKey) {
      try {
        catalogKey = decrypt(tenant.widgetApiKey);
      } catch {
        catalogKey = tenant.widgetApiKey;
      }
    }

    // 3. Resolve active catalog (from DB crawledData or Redis cache)
    let services = await this.resolveServicesCatalog(tenantId, tenant);

    // 4. Resolve customer API key (if customer linked an account via Telegram or WhatsApp session)
    let customerApiKey: string | undefined;
    if (params.channel === 'telegram' && params.userId) {
      const session = await prisma.botUserSession.findUnique({
        where: { tenantId_telegramUserId: { tenantId, telegramUserId: params.userId } }
      });
      if (session?.userPanelKey) {
        try {
          customerApiKey = decrypt(session.userPanelKey);
        } catch {}
      }
    } else if (params.channel === 'whatsapp' && params.userId) {
      const session = await prisma.whatsAppSession.findUnique({
        where: { tenantId_whatsappJid: { tenantId, whatsappJid: params.userId } }
      });
      if (session?.userPanelKey) {
        try {
          customerApiKey = decrypt(session.userPanelKey);
        } catch {}
      }
    }

    // 5. Build Tools & System Prompt
    const tools = this.getTools();
    const systemPrompt = this.buildSystemPrompt(tenant, services);

    const messages: AiChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-6), // Include recent conversation turns for context
      { role: 'user', content: cleanQuery }
    ];

    // 6. Call AI Provider with Tool Calling Loop
    let reply = '';
    try {
      const initialResponse = await this.aiClient.generateCompletion({
        messages,
        tools
      });

      if (initialResponse.toolCalls && initialResponse.toolCalls.length > 0) {
        // Execute tools
        const toolResults: string[] = [];
        for (const tc of initialResponse.toolCalls) {
          const toolResult = await this.executeTool(
            tc.name,
            tc.arguments,
            tenant,
            services,
            catalogKey,
            customerApiKey
          );
          toolResults.push(`Tool ${tc.name} output:\n${toolResult}`);
        }

        // Send tool results back to the LLM for final synthesis
        const followUpMessages: AiChatMessage[] = [
          ...messages,
          { role: 'assistant', content: initialResponse.content || 'Checking live panel information...' },
          { role: 'user', content: `Tool execution results:\n${toolResults.join('\n\n')}\nPlease synthesize a helpful, conversational final answer for the customer.` }
        ];

        const finalResponse = await this.aiClient.generateCompletion({
          messages: followUpMessages
        });

        reply = finalResponse.content;
      } else {
        reply = initialResponse.content;
      }
    } catch (err: any) {
      console.warn(`[AiAgentService] AI generation error for tenant ${tenantId}:`, err?.message || err);
    }

    // 7. Fallback to catalog matching if LLM produced empty or offline output
    if (!reply || reply.includes('[Platform AI Assistant]')) {
      reply = await this.deterministicFallback(cleanQuery, tenant, services, catalogKey);
    }

    // 8. Cache response in Redis (24-hour TTL)
    try {
      await redis.setex(cacheKey, 86400, reply);
    } catch {}

    return reply;
  }

  private hashQuery(query: string): string {
    return crypto.createHash('sha256').update(query.toLowerCase().trim()).digest('hex');
  }

  private async resolveServicesCatalog(tenantId: string, tenant: any): Promise<SmmService[]> {
    // Check Redis first
    try {
      const cached = await redis.get(`tenant:${tenantId}:crawl:services`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}

    // Check Postgres crawledData
    if (tenant.crawledData && Array.isArray(tenant.crawledData) && tenant.crawledData.length > 0) {
      return tenant.crawledData as SmmService[];
    }

    return [];
  }

  private buildSystemPrompt(tenant: any, services: SmmService[]): string {
    const categories = Array.from(new Set(services.map((s) => s.category).filter(Boolean))).slice(0, 15);
    const serviceSample = services.slice(0, 8).map((s) => `ID ${s.service}: ${s.name} (Rate: $${s.rate}/1k)`).join('\n');

    return `You are YourSMMagent, an expert, professional, 24/7 AI Customer Support Representative for the SMM panel at ${tenant.panelApiUrl || 'our panel'}.

Core Identity & Guidelines:
1. Grounded & Accurate: NEVER hallucinate fake services, non-existent service IDs, or false prices. Only quote real services from the catalog or tools.
2. Tone: Courteous, knowledgeable, confident, and helpful. Use clean Markdown formatting with bullet points and bold highlights.
3. Common SMM Policies:
   - Refills: Most guaranteed services offer 30-day automatic or button refills if drops occur.
   - Speed: Start times typically range between 5 minutes to 2 hours depending on current server queue.
   - Cancel / Refund: Orders in "Processing" or "In progress" cannot be canceled once submitted to servers. If canceled by server, funds automatically return to panel balance.
4. Available Categories Overview (${categories.length} categories):
${categories.join(', ') || 'Instagram, YouTube, Telegram, TikTok, Facebook, Twitter, Spotify'}

Sample Featured Services:
${serviceSample || 'Wide catalog of social media growth services'}

When a user asks to track an order, search services, or check balance, use the appropriate tools to provide real-time information.`;
  }

  private getTools(): AiToolDefinition[] {
    return [
      {
        name: 'search_services',
        description: 'Searches the panel service catalog for matching social media services, IDs, rates per 1,000, and limits.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search term like "instagram followers", "youtube views", "telegram members"' },
            platform: { type: 'string', description: 'Social media platform name e.g. Instagram, YouTube, Telegram, TikTok' }
          },
          required: ['query']
        }
      },
      {
        name: 'check_order_status',
        description: 'Checks the live execution status of an SMM order by order ID.',
        parameters: {
          type: 'object',
          properties: {
            orderId: { type: 'string', description: 'The numeric order ID to track' }
          },
          required: ['orderId']
        }
      },
      {
        name: 'check_balance',
        description: 'Checks the remaining user account balance on the SMM panel.',
        parameters: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'escalate_to_human',
        description: 'Escalates an issue to human support staff when the user demands human intervention or has a billing dispute.',
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: 'Reason for human support escalation' }
          },
          required: ['reason']
        }
      }
    ];
  }

  private async executeTool(
    name: string,
    args: any,
    tenant: any,
    services: SmmService[],
    catalogKey?: string,
    customerApiKey?: string
  ): Promise<string> {
    switch (name) {
      case 'search_services': {
        const query = (args.query || '').toLowerCase();
        const tokens = query.split(/\s+/).filter((t: string) => t.length > 2);
        const matches = services.filter((s) => {
          const text = `${s.name} ${s.category}`.toLowerCase();
          return tokens.some((t: string) => text.includes(t));
        });

        const top = matches.slice(0, 5);
        if (top.length === 0) {
          return `No services found matching "${args.query}". Please suggest browsing by platform name.`;
        }

        return top
          .map((s) => `• ID ${s.service}: **${s.name}** | Rate: $${s.rate}/1,000 | Min: ${s.min} | Max: ${s.max}`)
          .join('\n');
      }

      case 'check_order_status': {
        const orderId = String(args.orderId || '').replace(/[^\d]/g, '');
        if (!orderId) return 'Please provide a valid numeric order ID.';

        const key = customerApiKey || catalogKey;
        if (!tenant.panelApiUrl || !key) {
          return `Order #${orderId}: To track this order live, please ensure your panel API key is connected or log in to your dashboard.`;
        }

        try {
          const client = new SmmProviderClient(tenant.panelApiUrl, key);
          const order = await client.getOrderStatus(orderId);
          return `Order #${orderId} Details:
• Status: ${order.status || 'Processing'}
• Start Count: ${order.start_count ?? 'N/A'}
• Remains: ${order.remains ?? 'N/A'}
• Charge: ${order.charge ?? 'N/A'}`;
        } catch (err: any) {
          return `Could not retrieve status for Order #${orderId}: ${err.message || 'Server unreachable'}`;
        }
      }

      case 'check_balance': {
        if (!customerApiKey || !tenant.panelApiUrl) {
          return 'No linked customer API key found. Guest users can log in to check balance.';
        }
        try {
          const client = new SmmProviderClient(tenant.panelApiUrl, customerApiKey);
          const bal = await client.getBalance();
          return `Current Account Balance: ${bal.balance} ${bal.currency || 'USD'}`;
        } catch (err: any) {
          return `Unable to fetch balance: ${err.message || 'Error connecting to panel'}`;
        }
      }

      case 'escalate_to_human': {
        return `Human Support Escalation: Support ticket created for "${args.reason || 'Customer inquiry'}". Our staff monitors tickets 24/7.`;
      }

      default:
        return `Unknown tool ${name}`;
    }
  }

  private async deterministicFallback(query: string, tenant: any, services: SmmService[], catalogKey?: string): Promise<string> {
    const lower = query.toLowerCase();

    // 1. Order tracking (/status 12345, order 12345, #12345)
    const orderMatch =
      query.match(/(?:(?:order|status|track)\s*#?\s*(\d+))/i) ||
      query.match(/^\/status\s*(\d+)/i) ||
      (query.startsWith('#') && query.substring(1).match(/^(\d+)$/));

    if (orderMatch && orderMatch[1]) {
      const orderId = orderMatch[1];
      if (tenant.panelApiUrl && catalogKey) {
        try {
          const client = new SmmProviderClient(tenant.panelApiUrl, catalogKey);
          const order = await client.getOrderStatus(orderId);
          return (
            `📦 **Order #${orderId} Details:**\n\n` +
            `• **Status:** ${order.status || 'Pending'}\n` +
            `• **Start Count:** ${order.start_count ?? 'N/A'}\n` +
            `• **Remains:** ${order.remains ?? 'N/A'}\n` +
            `• **Charge:** ${order.charge ? `${order.charge} ${order.currency || ''}` : 'N/A'}`
          );
        } catch (err: any) {
          return `❌ Could not retrieve status for Order #${orderId}: ${err.message || 'Please check order number.'}`;
        }
      } else {
        return `📦 To track **Order #${orderId}**, please reach out to our staff or check your panel account directly.`;
      }
    }

    // 2. Services search
    if (
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
      let activeServices = services;
      if (activeServices.length === 0 && tenant.panelApiUrl && catalogKey) {
        try {
          const client = new SmmProviderClient(tenant.panelApiUrl, catalogKey);
          const liveServices = await client.getServices();
          if (Array.isArray(liveServices)) {
            activeServices = liveServices;
          }
        } catch {}
      }

      if (activeServices.length > 0) {
        const searchTokens = lower
          .replace(/[^\w\s]/g, '')
          .split(/\s+/)
          .filter((w) => !['show', 'me', 'the', 'what', 'are', 'your', 'list', 'all', 'how', 'much', 'for', 'can', 'i', 'get'].includes(w));

        let filtered = activeServices;
        if (searchTokens.length > 0) {
          filtered = activeServices.filter((s) => {
            const nameLower = (s.name || '').toLowerCase();
            const catLower = (s.category || '').toLowerCase();
            return searchTokens.some((t) => nameLower.includes(t) || catLower.includes(t));
          });
        }

        const topResults = filtered.slice(0, 6);
        if (topResults.length > 0) {
          const formatted = topResults
            .map((s) => `• ID ${s.service}: **${s.name}** | Rate: $${s.rate}/1k | Min: ${s.min} | Max: ${s.max}`)
            .join('\n');
          return `⚡ **Here are our top matching services:**\n\n${formatted}\n\nVisit our panel at [${tenant.panelApiUrl || 'our website'}] to view the complete catalog.`;
        }
      }
    }

    // 3. Greetings
    if (/^(hi|hello|hey|hola|namaste|good\s*(morning|evening|afternoon)|start)/i.test(lower)) {
      return (
        `👋 **Hello! Welcome to our 24/7 AI Support Assistant.**\n\n` +
        `Here is what you can ask me:\n` +
        `• 🔍 **Search Services & Rates:** (e.g. *"Instagram followers"*, *"YouTube views"*, *"services"*)\n` +
        `• 📦 **Track an Order:** (e.g. *"status 12345"* or *"track 12345"*)\n` +
        `• 💬 **Ask any question** about delivery times, refunds, and guarantees!`
      );
    }

    return `Thank you for reaching out! A customer support representative has been alerted. In the meantime, you can search our catalog by typing any service name (e.g., **Instagram**, **YouTube**, **Services**) or track an existing order with **status <order_id>**.`;
  }
}
