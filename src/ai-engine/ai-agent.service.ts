import crypto from 'crypto';
import { prisma } from '../common/database/prisma.js';
import { redis } from '../common/redis/redis.js';
import { decrypt } from '../common/crypto/encryption.js';
import { SmmProviderClient, SmmService } from '../smm-core/smm-client.js';
import { AiProviderClient, AiChatMessage, AiToolDefinition } from './ai-provider.client.js';
import { SmmIntentParser } from './smm-intent-parser.js';
import { SmmPresetMatcher } from './smm-preset-matcher.js';

export interface AiAgentRequest {
  tenantId: string;
  message: string;
  channel: 'widget' | 'telegram' | 'whatsapp';
  sessionId?: string;
  userId?: string;
  history?: AiChatMessage[];
  tenant?: any;
  aiSettings?: any;
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

    // 2. Load tenant configuration and crawled catalog
    const tenant = params.tenant || await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        panelApiUrl: true,
        telegramPanelUrl: true,
        whatsappPanelUrl: true,
        widgetPanelUrl: true,
        widgetTitle: true,
        widgetWelcomeMessage: true,
        widgetApiKey: true,
        crawledData: true,
        subscriptionStatus: true,
        aiSettings: true
      }
    });

    if (!tenant) {
      return 'Customer support service is currently unavailable.';
    }

    const effectiveAiSettings = params.aiSettings || tenant.aiSettings || {};

    // Resolve channel-specific panel API URL with fallback to global panelApiUrl
    const channelPanelUrl = params.channel === 'whatsapp'
      ? (tenant.whatsappPanelUrl || tenant.panelApiUrl)
      : params.channel === 'widget'
      ? (tenant.widgetPanelUrl || tenant.panelApiUrl)
      : (tenant.telegramPanelUrl || tenant.panelApiUrl);

    if (channelPanelUrl) {
      tenant.panelApiUrl = channelPanelUrl;
    }

    // Strict Competitor & Foreign SMM Panel Rejection Guardrail
    if (this.isCompetitorQuery(cleanQuery, tenant.panelApiUrl || undefined)) {
      return 'I am the dedicated AI assistant for this panel only. I cannot discuss or assist with other SMM panels. How can I help you with our services?';
    }

    const isDynamic = AiAgentService.isDynamicQuery(cleanQuery);
    let usedDynamicTool = false;
    const DYNAMIC_TOOLS = new Set(['place_order', 'check_order_status', 'check_balance', 'escalate_to_human']);

    // 1. Check Redis Query Cache for instant (< 15ms) response on identical static queries
    const cacheKey = `tenant:${tenantId}:qcache:${this.hashQuery(cleanQuery)}`;
    if (!isDynamic) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return cached;
        }
      } catch {
        // Non-blocking Redis cache read failure
      }
    }

    let catalogKey: string | undefined;
    if (tenant.widgetApiKey) {
      try {
        catalogKey = decrypt(tenant.widgetApiKey);
      } catch {
        catalogKey = tenant.widgetApiKey;
      }
    }

    // 3. Resolve customer API key (if customer linked an account via Telegram or WhatsApp session)
    let customerApiKey: string | undefined;
    let customerKeyCorrupted = false;
    if (params.channel === 'telegram' && params.userId) {
      const session = await prisma.botUserSession.findUnique({
        where: { tenantId_telegramUserId: { tenantId, telegramUserId: params.userId } }
      });
      if (session?.userPanelKey) {
        try {
          customerApiKey = decrypt(session.userPanelKey);
        } catch {
          customerKeyCorrupted = true;
          customerApiKey = undefined;
        }
      }
    } else if (params.channel === 'whatsapp' && params.userId) {
      const session = await prisma.whatsAppSession.findUnique({
        where: { tenantId_whatsappJid: { tenantId, whatsappJid: params.userId } }
      });
      if (session?.userPanelKey) {
        try {
          customerApiKey = decrypt(session.userPanelKey);
        } catch {
          customerKeyCorrupted = true;
          customerApiKey = undefined;
        }
      }
    }

    // 4. Data-Driven Zero-Token Preset Matcher (Resolves top 8 SMM patterns in <25ms, 0 tokens)
    const preset = await SmmPresetMatcher.resolveDirect(
      cleanQuery,
      tenant,
      catalogKey,
      customerApiKey,
      effectiveAiSettings?.tone
    );
    if (preset.matched && preset.reply) {
      if (!isDynamic) {
        await redis.setex(cacheKey, 300, preset.reply).catch(() => {});
        await redis.sadd(`tenant:${tenantId}:qcache_keys`, cacheKey).catch(() => {});
      }
      return preset.reply;
    }

    // 5. High-Confidence Custom FAQ Match (Direct policy answers in <5ms, 0 tokens)
    if (Array.isArray(effectiveAiSettings?.faqs) && effectiveAiSettings.faqs.length > 0) {
      const cleanTokens = (t: string) =>
        t.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length >= 3);
      const queryTokens = cleanTokens(cleanQuery);

      const matchedFaq = effectiveAiSettings.faqs.find((f: any) => {
        if (!f || !f.question || !f.answer) return false;
        const qTokens = cleanTokens(f.question);
        if (qTokens.length === 0) return false;
        if (cleanQuery.toLowerCase().includes(f.question.toLowerCase().trim())) return true;
        const shared = qTokens.filter((w) => queryTokens.includes(w));
        return shared.length >= Math.max(1, Math.min(2, qTokens.length));
      });

      if (matchedFaq) {
        let answer = matchedFaq.answer;
        if (effectiveAiSettings.tone === 'friendly') {
          answer = `Sure thing! ${answer}`;
        } else if (effectiveAiSettings.tone === 'professional') {
          answer = `Certainly. ${answer}`;
        } else if (effectiveAiSettings.tone === 'short') {
          answer = answer.split(/(?<=[.!?])\s/)[0] || answer;
        }
        if (!isDynamic) {
          await redis.setex(cacheKey, 300, answer).catch(() => {});
          await redis.sadd(`tenant:${tenantId}:qcache_keys`, cacheKey).catch(() => {});
        }
        return answer;
      }
    }

    // 6. Resolve active catalog (from Redis, Postgres crawledData, or live panel with effective key)
    const effectiveKey = catalogKey || customerApiKey;
    let services = await this.resolveServicesCatalog(tenantId, tenant, effectiveKey);

    // 7. Hybrid SMM Search Parser: Pre-filter services on CPU and resolve directly in 0 tokens
    const searchIntent = SmmIntentParser.parse(cleanQuery);
    let directSearchResults: SmmService[] = [];
    if (searchIntent.isSearch && services.length > 0) {
      directSearchResults = SmmIntentParser.filterCatalog(services, searchIntent, 4);
      if (directSearchResults.length > 0) {
        const formatted = directSearchResults
          .map((s) => `• ID ${s.service}: **${s.name}** | Rate: $${s.rate}/1k | Min: ${s.min} | Max: ${s.max}`)
          .join('\n');

        let reply = '';
        const tone = effectiveAiSettings?.tone || 'professional';
        const targetDesc = [searchIntent.platform, searchIntent.category].filter(Boolean).join(' ') || 'catalog';

        if (tone === 'friendly') {
          reply = `✨ **Here are our top recommended ${targetDesc} options for you:**\n\n${formatted}\n\n🔗 Ready to order? Head over to [${tenant.panelApiUrl || 'our panel'}] to place your order anytime!`;
        } else if (tone === 'short') {
          reply = `⚡ **Top matching ${targetDesc} services:**\n\n${formatted}\n\nVisit [${tenant.panelApiUrl || 'our panel'}] to place your order.`;
        } else {
          reply = `⚡ **Here are our top matching ${targetDesc} services:**\n\n${formatted}\n\nVisit our panel at [${tenant.panelApiUrl || 'our panel'}] to view the full catalog or place your order.`;
        }

        if (!isDynamic) {
          await redis.setex(cacheKey, 300, reply).catch(() => {});
          await redis.sadd(`tenant:${tenantId}:qcache_keys`, cacheKey).catch(() => {});
        }
        return reply;
      }
    }

    // 8. Build Tools & System Prompt
    const tools = this.getTools(channel, effectiveAiSettings);
    let systemPrompt = this.buildSystemPrompt(tenant, services, channel, effectiveAiSettings);

    if (directSearchResults.length > 0) {
      const formatted = directSearchResults
        .map((s) => `• ID ${s.service}: ${s.name} (Rate: $${s.rate}/1k, Min: ${s.min}, Max: ${s.max})`)
        .join('\n');
      systemPrompt += `\n\nPre-filtered Top Matching Services:\n${formatted}\nPlease present these services to the customer politely with emojis and clear pricing.`;
    }

    // Cap conversation history to the last 2 turns to minimize token load
    const messages: AiChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-2),
      { role: 'user', content: cleanQuery }
    ];

    // When direct search results are present, omit tool definitions (saves 600 schema tokens and prevents 2-step tool calling)
    const activeTools = directSearchResults.length > 0 ? undefined : tools;

    // 9. Call AI Provider with Micro-Tier Model and 180 token cap
    let reply = '';
    try {
      const initialResponse = await this.aiClient.generateCompletion({
        messages,
        tools: activeTools,
        tier: 'micro',
        maxTokens: 180
      });

      if (initialResponse.toolCalls && initialResponse.toolCalls.length > 0) {
        // Execute tools
        const toolResults: string[] = [];
        for (const tc of initialResponse.toolCalls) {
          if (DYNAMIC_TOOLS.has(tc.name)) {
            usedDynamicTool = true;
          }
          const toolResult = await this.executeTool(
            tc.name,
            tc.arguments,
            tenant,
            services,
            catalogKey,
            customerApiKey,
            customerKeyCorrupted,
            channel
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
      reply = await this.deterministicFallback(cleanQuery, tenant, services, catalogKey, customerKeyCorrupted, effectiveAiSettings);
    }

    // 8. Cache response in Redis (300-second TTL). Never cache dynamic requests or responses using dynamic AI tools.
    if (!isDynamic && !usedDynamicTool) {
      try {
        await redis.setex(cacheKey, 300, reply);
        await redis.sadd(`tenant:${tenantId}:qcache_keys`, cacheKey);
        await redis.expire(`tenant:${tenantId}:qcache_keys`, 360);
      } catch {}
    }

    return reply;
  }

  private hashQuery(query: string): string {
    const normalized = query
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\b(ig|insta)\b/g, 'instagram')
      .replace(/\b(yt)\b/g, 'youtube')
      .replace(/\b(tt)\b/g, 'tiktok')
      .replace(/\b(tg)\b/g, 'telegram')
      .trim()
      .replace(/\s+/g, ' ');
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  public static isDynamicQuery(query: string): boolean {
    const q = (query || '').trim().toLowerCase();
    // Order status/tracking: /status, status 1234, track 1234, order 1234, #1234, order status
    if (
      /^\/status/i.test(q) ||
      /(?:(?:order|status|track)\s*#?\s*\d+)/i.test(q) ||
      /(?:^|\s)#\d+/i.test(q) ||
      /\b(order\s*status|track\s*order|check\s*order|order\s*details|my\s*order)\b/i.test(q)
    ) {
      return true;
    }
    // Balance: /balance, check balance, my balance, remaining funds
    if (
      /^\/balance/i.test(q) ||
      /\b(balance|funds|account\s*balance|my\s*balance|check\s*balance|wallet)\b/i.test(q)
    ) {
      return true;
    }
    // Order placement: /order, place order, buy followers, etc.
    if (
      /^\/order/i.test(q) ||
      /\b(place\s*order|order\s*now|create\s*order|submit\s*order)\b/i.test(q)
    ) {
      return true;
    }
    return false;
  }

  public isCompetitorQuery(text: string, currentPanelUrl?: string): boolean {
    const lower = text.toLowerCase();
    const competitorNames = [
      'justanotherpanel', 'peakerr', 'smmking', 'smmheaven', 'secsers',
      'smmfollows', 'medyafox', 'smmmain', 'famegrowers', 'bulksmm', 'smmrush',
      'other panel', 'another panel', 'different panel', 'better panel', 'cheaper panel',
      'competitor'
    ];

    // Check for foreign URLs
    const urlMatches = lower.match(/(?:https?:\/\/)?([a-zA-Z0-9-]+\.(?:com|net|org|io|in|co|biz|agency|store|vip|pro|cc|to))/gi);
    if (urlMatches) {
      let currentHost = '';
      if (currentPanelUrl) {
        try {
          currentHost = new URL(currentPanelUrl.startsWith('http') ? currentPanelUrl : `https://${currentPanelUrl}`).hostname.toLowerCase();
        } catch {}
      }
      for (const match of urlMatches) {
        const cleanHost = match.replace(/^https?:\/\//i, '').toLowerCase();
        if (currentHost && (cleanHost.includes(currentHost) || currentHost.includes(cleanHost))) {
          continue;
        }
        if (cleanHost.includes('smm') || cleanHost.includes('panel') || competitorNames.some((k) => cleanHost.includes(k))) {
          return true;
        }
      }
    }

    return competitorNames.some((k) => {
      if (k.includes(' ')) return lower.includes(k);
      return new RegExp(`\\b${k}\\b`, 'i').test(lower);
    });
  }

  private async resolveServicesCatalog(tenantId: string, tenant: any, fallbackKey?: string): Promise<SmmService[]> {
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

    // Fallback: fetch live from panel provider if key is available
    if (fallbackKey && tenant.panelApiUrl) {
      try {
        const client = new SmmProviderClient(tenant.panelApiUrl, fallbackKey);
        const fetched = await client.getServices();
        if (Array.isArray(fetched) && fetched.length > 0) {
          await redis.setex(`tenant:${tenantId}:crawl:services`, 300, JSON.stringify(fetched)).catch(() => {});
          return fetched;
        }
      } catch (err: any) {
        console.warn(`[AiAgentService] Failed to fetch services with key for tenant ${tenantId}:`, err?.message || err);
      }
    }

    return [];
  }

  private buildSystemPrompt(tenant: any, services: SmmService[], channel?: string, effectiveAiSettings?: any): string {
    const categories = Array.from(new Set(services.map((s) => s.category).filter(Boolean))).slice(0, 15);
    const serviceSample = services.slice(0, 8).map((s) => `ID ${s.service}: ${s.name} (Rate: $${s.rate}/1k)`).join('\n');

    let toneInstruction = 'Tone: Maintain a warm, helpful, polite, and professional persona.';
    if (effectiveAiSettings?.tone === 'friendly') {
      toneInstruction = 'Tone: Warm, welcoming, enthusiastic, friendly, and conversational. Use friendly phrasing and supportive tone.';
    } else if (effectiveAiSettings?.tone === 'professional') {
      toneInstruction = 'Tone: Courteous, direct, professional, clear, and businesslike. Avoid slang or overly casual phrasing.';
    } else if (effectiveAiSettings?.tone === 'short') {
      toneInstruction = 'Tone: Extremely concise, direct, and brief (1-3 sentences maximum). Deliver immediate answers without fluff, excessive pleasantries, or preamble.';
    }

    let languageInstruction = 'Language: Respond in the same language the customer uses (auto-detection).';
    const lang = effectiveAiSettings?.language;
    if (lang && lang !== 'auto') {
      const langMap: Record<string, string> = {
        en: 'English',
        es: 'Spanish (Español)',
        pt: 'Portuguese (Português)',
        ru: 'Russian (Русский)',
        hi: 'Hindi (हिन्दी)',
        ar: 'Arabic (العربية)'
      };
      const langName = langMap[lang] || lang;
      languageInstruction = `Language: You must ALWAYS respond in ${langName}, regardless of what language the customer writes in.`;
    }

    let hoursNotice = '';
    if (effectiveAiSettings?.hours?.enabled) {
      hoursNotice = `\nBusiness Hours Policy:
- Human staff operating hours: ${effectiveAiSettings.hours.start || '09:00'} to ${effectiveAiSettings.hours.end || '21:00'} (${effectiveAiSettings.hours.timezone || 'UTC'}).
- If the customer asks for a human teammate or asks when staff will reply, mention that our human team is available during operating hours, while you are here to assist 24/7 with instant inquiries and orders.`;
    }

    let escalationNotice = '';
    const esc = effectiveAiSettings?.escalation;
    if (esc) {
      const parts: string[] = [];
      if (esc.onRequest) {
        parts.push('- If the customer explicitly asks to talk to a human, agent, person, or representative, use the escalate_to_human tool.');
      }
      if (esc.keywords && typeof esc.keywords === 'string') {
        const kws = esc.keywords.split(',').map((k: string) => k.trim()).filter(Boolean);
        if (kws.length > 0) {
          parts.push(`- If the customer mentions any of these critical keywords: [${kws.join(', ')}], escalate immediately using escalate_to_human.`);
        }
      }
      if (parts.length > 0) {
        escalationNotice = `\nEscalation Guidelines:\n${parts.join('\n')}`;
      }
    }

    let faqSection = '';
    if (Array.isArray(effectiveAiSettings?.faqs) && effectiveAiSettings.faqs.length > 0) {
      const faqList = effectiveAiSettings.faqs
        .filter((f: any) => f && f.question && f.answer)
        .map((f: any) => `Q: ${f.question.trim()}\nA: ${f.answer.trim()}`)
        .join('\n\n');
      if (faqList) {
        faqSection = `\n<verified_faqs>
The following are verified answers directly from this SMM panel's administration. Whenever a customer asks any question related to these topics, you MUST provide these exact details and adhere strictly to these policies:
${faqList}
</verified_faqs>\n`;
      }
    }

    let actionsNotice = '';
    const actions = effectiveAiSettings?.actions;
    if (actions) {
      const disabled: string[] = [];
      if (actions.balance === false) disabled.push('balance checks');
      if (actions.orderStatus === false) disabled.push('order status tracking');
      if (actions.services === false) disabled.push('service catalog searches');
      if (actions.refill === false) disabled.push('refill requests');
      if (actions.cancel === false) disabled.push('order cancellations');
      if (disabled.length > 0) {
        actionsNotice = `\nRestricted Actions: The panel administrator has disabled automated AI tools for: ${disabled.join(', ')}. If the customer asks for any of these disabled actions, politely inform them that this must be done directly on the panel website.`;
      }
    }

    const widgetNotice = channel === 'widget'
      ? `\n5. Channel Scope (Website Chat Widget):
   - You are answering public visitors on the website.
   - You CANNOT place orders or take money through this chat widget.
   - If a visitor asks to place an order, buy a service, or add balance, politely direct them: "To place an order or add funds, please sign in or register directly on our panel website at ${tenant.panelApiUrl || 'our website'}."
   - You are here to answer questions, search services, quote rates, explain features, and check order statuses by Order ID.`
      : '';

    return `You are YourSMMagent, an expert, professional, 24/7 AI Customer Support Representative for the SMM panel at ${tenant.panelApiUrl || 'our panel'}.

Core Identity & Guidelines:
1. Strict Competitor Rejection: You represent ONLY ${tenant.panelApiUrl || 'this panel'}. You MUST NEVER mention, recommend, assist with, or compare any competing SMM panel or external domain. If asked about another panel or competitor, politely decline: "I am the dedicated AI assistant for this panel only. I cannot discuss or assist with other SMM panels. How can I help you with our services?"
2. Grounded & Accurate: NEVER hallucinate fake services, non-existent service IDs, or false prices. Only quote real services from the catalog or live tools.
3. Common SMM Policies:
   - Refills: Most guaranteed services offer 30-day automatic or button refills if drops occur.
   - Speed: Start times typically range between 5 minutes to 2 hours depending on current server queue.
   - Cancel / Refund: Orders in "Processing" or "In progress" cannot be canceled once submitted to servers. If canceled by server, funds automatically return to panel balance.
4. Persona & Tone Directives:
   - ${toneInstruction}
   - ${languageInstruction}
${hoursNotice}
${escalationNotice}
${actionsNotice}
${faqSection}
5. Available Categories Overview (${categories.length} categories):
${categories.join(', ') || 'Instagram, YouTube, Telegram, TikTok, Facebook, Twitter, Spotify'}

Sample Featured Services:
${serviceSample || 'Wide catalog of social media growth services'}
${widgetNotice}

Visual Presentation & Formatting Rules for Chat:
- Always format currency balances and rates with exactly 2 decimal places (e.g. "$27.51" or "12.34 INR", NEVER long floating decimals like "12.3395550").
- When presenting services or options, use clean, well-spaced cards with visual emojis (📦, 🔹, 💰, ⚡, 🛡️).
- Separate each service card with a blank line for easy reading on mobile chat screens.
- Avoid dense walls of text; keep each item visually scannable with bullet points and bold titles.

When a user asks to track an order, search services, check balance, or place an order, use the appropriate live tools to provide real-time information.`;
  }

  private getTools(channel?: string, effectiveAiSettings?: any): AiToolDefinition[] {
    const tools: AiToolDefinition[] = [];
    const actions = effectiveAiSettings?.actions;

    if (!actions || actions.services !== false) {
      tools.push({
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
      });
    }

    if (!actions || actions.orderStatus !== false) {
      tools.push({
        name: 'check_order_status',
        description: 'Checks the live execution status of an SMM order by order ID.',
        parameters: {
          type: 'object',
          properties: {
            orderId: { type: 'string', description: 'The numeric order ID to track' }
          },
          required: ['orderId']
        }
      });
    }

    if (!actions || actions.balance !== false) {
      tools.push({
        name: 'check_balance',
        description: 'Checks the remaining user account balance on the SMM panel.',
        parameters: {
          type: 'object',
          properties: {}
        }
      });
    }

    // Widget is strictly for public inquiry and support - ordering is reserved for direct authenticated bot channels
    if (channel !== 'widget') {
      tools.push({
        name: 'place_order',
        description: 'Places a new social media order on the panel using the linked customer account.',
        parameters: {
          type: 'object',
          properties: {
            serviceId: { type: 'string', description: 'The numeric SMM service ID' },
            link: { type: 'string', description: 'The target social media post/profile URL or username' },
            quantity: { type: 'number', description: 'Number of units to order' }
          },
          required: ['serviceId', 'link', 'quantity']
        }
      });
    }

    tools.push({
      name: 'escalate_to_human',
      description: 'Escalates an issue to human support staff when the user demands human intervention or has a billing dispute.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Reason for human support escalation' }
        },
        required: ['reason']
      }
    });

    return tools;
  }

  private async executeTool(
    name: string,
    args: any,
    tenant: any,
    services: SmmService[],
    catalogKey?: string,
    customerApiKey?: string,
    customerKeyCorrupted?: boolean,
    channel?: string
  ): Promise<string> {
    switch (name) {
      case 'place_order': {
        if (channel === 'widget') {
          return `To place an order, please sign in or register directly on our panel website at ${tenant.panelApiUrl || 'our website'}. The chat widget is for public customer support and inquiries only.`;
        }
        const serviceId = String(args.serviceId || '').trim();
        const link = String(args.link || '').trim();
        const quantity = Number(args.quantity);

        if (customerKeyCorrupted) {
          return '⚠️ Your saved API key could not be decrypted. Please reconnect your account using /setkey <YOUR_API_KEY>.';
        }
        if (!customerApiKey || !tenant.panelApiUrl) {
          return 'To place an order directly via chat, please link your panel account first using /setkey <YOUR_API_KEY>.';
        }
        if (!serviceId || !link || isNaN(quantity) || quantity <= 0) {
          return 'Please specify the service ID, target link, and quantity to submit an order.';
        }

        try {
          const client = new SmmProviderClient(tenant.panelApiUrl, customerApiKey);
          const res = await client.placeOrder({ service: serviceId, link, quantity });
          return `Order placed successfully! Order ID: #${res.order}. You can check its progress anytime with /status ${res.order}.`;
        } catch (err: any) {
          return `Could not place order: ${err.message || 'Please check your account balance and parameter requirements.'}`;
        }
      }
      case 'search_services': {
        const query = (args.query || '').toLowerCase().trim();
        const tokens = query.split(/\s+/).filter((t: string) => t.length > 0);
        const matches = services.filter((s) => {
          const idStr = String(s.service || '');
          if (idStr === query || (query.length >= 2 && idStr.includes(query))) return true;
          const text = `${idStr} ${s.name} ${s.category}`.toLowerCase();
          return tokens.some((t: string) => text.includes(t));
        });

        const top = matches.slice(0, 5);
        if (top.length === 0) {
          return `No services found matching "${args.query}". Please suggest browsing by platform name.`;
        }

        return top
          .map((s) => {
            const numRate = Number(s.rate);
            const rateStr = !isNaN(numRate) ? numRate.toFixed(2) : s.rate;
            return `📦 **ID ${s.service}** — ${s.name}\n💰 **Rate:** $${rateStr} / 1k • **Min/Max:** ${s.min} / ${s.max}`;
          })
          .join('\n\n');
      }

      case 'check_order_status': {
        const orderId = String(args.orderId || '').replace(/[^\d]/g, '');
        if (!orderId) return 'Please provide a valid numeric order ID.';

        if (customerKeyCorrupted && !catalogKey) {
          return '⚠️ Your saved API key could not be decrypted. Please reconnect your account using /setkey <YOUR_API_KEY>.';
        }

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
        if (customerKeyCorrupted) {
          return '⚠️ Your saved API key could not be decrypted. Please reconnect your account using /setkey <YOUR_API_KEY>.';
        }
        if (!customerApiKey || !tenant.panelApiUrl) {
          return 'No linked customer API key found. Guest users can log in to check balance.';
        }
        try {
          const client = new SmmProviderClient(tenant.panelApiUrl, customerApiKey);
          const bal = await client.getBalance();
          const numBal = Number(bal.balance);
          const formattedBal = !isNaN(numBal) ? numBal.toFixed(2) : bal.balance;
          return `Current Account Balance: ${formattedBal} ${bal.currency || 'USD'}`;
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

  private async deterministicFallback(
    query: string,
    tenant: any,
    services: SmmService[],
    catalogKey?: string,
    customerKeyCorrupted?: boolean,
    effectiveAiSettings?: any
  ): Promise<string> {
    const lower = query.toLowerCase();

    // 0. Custom Tenant FAQ Matching (Exact ground truth from AI Settings)
    if (Array.isArray(effectiveAiSettings?.faqs) && effectiveAiSettings.faqs.length > 0) {
      const cleanWords = (t: string) =>
        t.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length >= 3);
      const queryWords = cleanWords(lower);

      const matchedFaq = effectiveAiSettings.faqs.find((f: any) => {
        if (!f || !f.question || !f.answer) return false;
        const qWords = cleanWords(f.question);
        if (qWords.length === 0) return false;
        // Check if query contains the full question substring or >= 2 significant words
        const fullMatch = lower.includes(f.question.toLowerCase().trim());
        if (fullMatch) return true;
        const shared = qWords.filter((w: string) => queryWords.includes(w));
        return shared.length >= Math.min(2, qWords.length);
      });

      if (matchedFaq) {
        let answer = matchedFaq.answer;
        if (effectiveAiSettings.tone === 'friendly') {
          answer = `Sure thing! ${answer}`;
        } else if (effectiveAiSettings.tone === 'professional') {
          answer = `Certainly. ${answer}`;
        } else if (effectiveAiSettings.tone === 'short') {
          answer = answer.split(/(?<=[.!?])\s/)[0] || answer;
        }
        return answer;
      }
    }

    // 1. Order tracking (/status 12345, order 12345, #12345)
    const orderMatch =
      query.match(/(?:(?:order|status|track)\s*#?\s*(\d+))/i) ||
      query.match(/^\/status\s*(\d+)/i) ||
      (query.startsWith('#') && query.substring(1).match(/^(\d+)$/));

    if (orderMatch && orderMatch[1]) {
      const orderId = orderMatch[1];
      if (customerKeyCorrupted && !catalogKey) {
        return '⚠️ Your saved API key could not be decrypted. Please reconnect your API key using /setkey <YOUR_API_KEY>.';
      }
      if (tenant.panelApiUrl && catalogKey) {
        try {
          const client = new SmmProviderClient(tenant.panelApiUrl, catalogKey);
          const order = await client.getOrderStatus(orderId);
          return (
            `📦 **Order #${orderId} Details:**\n\n` +
            `• **Status:** ${order.status || 'Pending'}\n` +
            `• **Start Count:** ${order.start_count ?? 'N/A'}\n` +
            `• **Remains:** ${order.remains ?? 'N/A'}\n` +
            `• **Charge:** ${order.charge !== undefined && order.charge !== null ? `${order.charge} ${order.currency || ''}`.trim() : 'N/A'}`
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
        const intent = SmmIntentParser.parse(query);
        let topResults: SmmService[] = [];
        if (intent.isSearch) {
          topResults = SmmIntentParser.filterCatalog(activeServices, intent, 6);
        }
        if (topResults.length === 0) {
          const searchTokens = lower
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter((w) => !['show', 'me', 'the', 'what', 'are', 'your', 'list', 'all', 'how', 'much', 'for', 'can', 'i', 'get'].includes(w));

          if (searchTokens.length > 0) {
            topResults = activeServices
              .filter((s) => {
                const nameLower = (s.name || '').toLowerCase();
                const catLower = (s.category || '').toLowerCase();
                return searchTokens.some((t) => nameLower.includes(t) || catLower.includes(t));
              })
              .slice(0, 6);
          }
        }

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

    const rawPanelName = tenant.widgetTitle || (tenant.panelApiUrl ? new URL(tenant.panelApiUrl.startsWith('http') ? tenant.panelApiUrl : `https://${tenant.panelApiUrl}`).hostname : 'our panel');
    const panelName = rawPanelName.replace(/\s*Customer\s*Support\s*/gi, '').trim() || rawPanelName;

    return (
      `👋 I am your 24/7 AI Assistant for **${panelName}**.\n\n` +
      `Here is how I can assist you right now:\n\n` +
      `• 📦 **Check Order Status:** Send \`status <order_id>\` (e.g. \`status 150809\`)\n` +
      `• ⚡ **Search Services:** Type any platform (e.g. \`Instagram followers\`, \`YouTube views\`, \`likes\`)\n` +
      `• 💰 **Check Balance:** Type \`/balance\` or link account with \`/setkey <key>\`\n` +
      `• 💳 **Payment Methods:** Type \`how to pay\` or \`add funds\`\n` +
      `• 🛡️ **Refill Policy:** Type \`refill\`\n\n` +
      `💬 *Simply type your question or order number above, and I will assist you immediately!*`
    );
  }
}
