import { SmmProviderClient } from '../smm-core/smm-client.js';

export interface SmmPresetResult {
  matched: boolean;
  reply?: string;
  escalated?: boolean;
  intent?: string;
}

/**
 * Data-Driven SMM Preset Matcher.
 * Resolves the top 8 recurring SMM support message patterns directly on CPU for 0 tokens in <25ms.
 */
export class SmmPresetMatcher {
  /**
   * Evaluates incoming message against the 8 high-volume SMM patterns.
   */
  static async resolveDirect(
    query: string,
    tenant: any,
    catalogKey?: string,
    customerApiKey?: string,
    tone?: string
  ): Promise<SmmPresetResult> {
    const raw = (query || '').trim();
    const lower = raw.toLowerCase();

    // 1. Informal & Slang Greetings
    const greetingMatch = this.matchGreeting(lower, tenant, tone);
    if (greetingMatch.matched) return greetingMatch;

    // 1.5 Capability & Help Queries
    const capabilityMatch = this.matchCapabilities(lower, tenant);
    if (capabilityMatch.matched) return capabilityMatch;

    // 2. Incomplete Order Status Inquiries (e.g. "i want to check order status")
    const incompleteOrderMatch = this.matchIncompleteOrderTracking(lower);
    if (incompleteOrderMatch.matched) return incompleteOrderMatch;

    // 3. Order Tracking in Free Text
    const trackingMatch = await this.matchOrderTracking(raw, tenant, catalogKey, customerApiKey);
    if (trackingMatch.matched) return trackingMatch;

    // 4. Balance Checks
    const balanceMatch = await this.matchBalance(lower, tenant, customerApiKey);
    if (balanceMatch.matched) return balanceMatch;

    // 5. Payment Methods & Add Funds
    const paymentMatch = this.matchPayments(lower, tenant);
    if (paymentMatch.matched) return paymentMatch;

    // 6. Refill Inquiries
    const refillMatch = this.matchRefill(lower, tenant);
    if (refillMatch.matched) return refillMatch;

    // 7. Human Support Requests
    const humanMatch = this.matchHumanEscalation(lower, tenant);
    if (humanMatch.matched) return humanMatch;

    // 8. Courtesies & Closings
    const courtesyMatch = this.matchCourtesy(lower, tone);
    if (courtesyMatch.matched) return courtesyMatch;

    return { matched: false };
  }

  /**
   * 1. Greetings: "hlo", "hlw", "hello buddy", "hey bro", "hi", "yo", "start", "how are you"
   */
  static matchGreeting(lower: string, tenant: any, tone?: string): SmmPresetResult {
    // Polite conversational inquiries
    if (/^(how\s*(are|r)\s*(you|u)|how\s*do\s*you\s*do|how\s*is\s*it\s*going|whats\s*up)\b/i.test(lower)) {
      return {
        matched: true,
        intent: 'greeting',
        reply: `I'm doing great, thank you for asking! 😊 I am your 24/7 AI assistant ready to help you with service recommendations, order tracking, and account balance. How can I assist you today?`
      };
    }

    const greetingRegex =
      /^(hlo|hlw|hello|hi|hey|hey\s*bro|hello\s*buddy|yo|sup|hola|namaste|start|\/start|good\s*(morning|evening|afternoon)|anyone\s*here)\b/i;

    if (greetingRegex.test(lower) && lower.split(/\s+/).length <= 4) {
      const rawPanelName = tenant.widgetTitle || (tenant.panelApiUrl ? new URL(tenant.panelApiUrl.startsWith('http') ? tenant.panelApiUrl : `https://${tenant.panelApiUrl}`).hostname : 'our panel');
      const panelName = rawPanelName.replace(/\s*Customer\s*Support\s*/gi, '').trim() || rawPanelName;
      
      let prefix = '👋 **Hello! Welcome to ' + panelName + '**';
      if (tone === 'short') {
        prefix = '👋 **Hello! Welcome to ' + panelName + '.** How can I assist you?';
        return {
          matched: true,
          intent: 'greeting',
          reply: prefix
        };
      } else if (tone === 'professional') {
        prefix = '👋 **Greetings. Welcome to ' + panelName + ' Support.**';
      }

      const reply =
        `${prefix}\n\n` +
        `I am your 24/7 AI Assistant. How can I help you today?\n\n` +
        `• 📦 **Track an Order:** Type *"status <order_id>"* (e.g. *status 12345*)\n` +
        `• ⚡ **Search Services:** Type any platform (e.g. *"Instagram followers"*, *"YouTube views"*)\n` +
        `• 💰 **Check Balance:** Type */balance* or link account with */setkey <key>*\n` +
        `• ❓ **Questions:** Ask about refills, speeds, or payment methods anytime!`;

      return {
        matched: true,
        intent: 'greeting',
        reply
      };
    }
    return { matched: false };
  }

  /**
   * 1.5 Capabilities / Help Menu
   */
  static matchCapabilities(lower: string, tenant: any): SmmPresetResult {
    const isCapabilityQuery =
      /\b(how\s*can\s*you\s*help|what\s*can\s*you\s*do|what\s*are\s*your\s*(features|capabilities|commands)|help\s*me|show\s*commands|\/help|features|menu)\b/i.test(lower);
    if (!isCapabilityQuery) return { matched: false };

    const rawPanelName = tenant.widgetTitle || (tenant.panelApiUrl ? new URL(tenant.panelApiUrl.startsWith('http') ? tenant.panelApiUrl : `https://${tenant.panelApiUrl}`).hostname : 'our panel');
    const panelName = rawPanelName.replace(/\s*Customer\s*Support\s*/gi, '').trim() || rawPanelName;

    return {
      matched: true,
      intent: 'capabilities',
      reply:
        `👋 **Welcome to ${panelName} 24/7 Support!**\n\n` +
        `Here is everything I can do for you right here in chat:\n\n` +
        `• 📦 **Check Order Status:** Send *"status <order_id>"* (e.g. *"status 150809"*) or simply send the order number\n` +
        `• ⚡ **Search Services & Rates:** Ask for any service (e.g. *"Instagram followers"*, *"YouTube views"*, *"likes"*)\n` +
        `• 💰 **Account Balance:** Type */balance* or *"check bal"* to view your current funds\n` +
        `• 💳 **Payment Methods:** Ask *"how to pay"* or *"deposit methods"* to get deposit options\n` +
        `• 🛡️ **Refill & Drops:** Ask *"refill"* to learn how to trigger refills\n` +
        `• 👤 **Human Support:** Say *"talk to human"* if you need admin intervention\n\n` +
        `💬 *Simply type any question or order ID above to get started!*`
    };
  }

  /**
   * 2. Incomplete Order Inquiries (e.g. "i want to check order status", "how can i check order status??")
   */
  static matchIncompleteOrderTracking(lower: string): SmmPresetResult {
    const clean = lower.replace(/[?!.,\s]+$/, '').trim();
    const isIncomplete =
      /^(i\s*(want|need)\s*to\s*)?(check|track|view|know)\s*(my\s*)?order(\s*status)?$/i.test(clean) ||
      /^how\s*(can\s*i|do\s*i)\s*(check|track)\s*(my\s*)?order(\s*status)?$/i.test(clean) ||
      /^(order\s*status|track\s*order|check\s*order)$/i.test(clean);

    if (!isIncomplete) return { matched: false };

    return {
      matched: true,
      intent: 'incomplete_order_prompt',
      reply: `📦 **Track Your Order:**\n\nPlease reply with your **Order ID** (for example: \`status 12345\` or just send the number \`150809\`), and I will check its live progress for you immediately!`
    };
  }

  /**
   * 3. Order Tracking: "6748424 check order status", "status 12345", "track #48213"
   */
  static async matchOrderTracking(
    raw: string,
    tenant: any,
    catalogKey?: string,
    customerApiKey?: string
  ): Promise<SmmPresetResult> {
    const lower = raw.toLowerCase();
    const isOrderQuery =
      /(?:order|status|track)/i.test(lower) ||
      raw.startsWith('#') ||
      raw.startsWith('/status');

    if (!isOrderQuery) return { matched: false };

    // Extract all numeric sequences that look like order IDs (5 to 10 digits)
    const matches = raw.match(/\b\d{4,10}\b/g);
    if (!matches || matches.length === 0) return { matched: false };

    // Unique order IDs, limit to top 3
    const orderIds = Array.from(new Set(matches)).slice(0, 3);
    const key = customerApiKey || catalogKey;

    if (!tenant.panelApiUrl || !key) {
      const firstId = orderIds[0];
      return {
        matched: true,
        intent: 'order_tracking',
        reply: `📦 To track **Order #${firstId}** live, please link your panel account using **/setkey <YOUR_API_KEY>** or log in directly to [${tenant.panelApiUrl || 'our panel'}].`
      };
    }

    try {
      const client = new SmmProviderClient(tenant.panelApiUrl, key);
      const results: string[] = [];

      for (const id of orderIds) {
        try {
          const order = await client.getOrderStatus(id);
          const status = order.status || 'Processing';
          const charge = order.charge !== undefined && order.charge !== null ? `${order.charge} ${order.currency || 'USD'}`.trim() : 'N/A';
          const startCount = order.start_count ?? 'N/A';
          
          let remains = order.remains ?? 'N/A';
          if (typeof remains === 'number' && remains < 0) {
            remains = '0 (Completed)';
          } else if (typeof remains === 'string' && parseInt(remains, 10) < 0) {
            remains = '0 (Completed)';
          }

          const badge =
            status.toLowerCase().includes('complete') ? '✅' :
            status.toLowerCase().includes('progress') ? '⚡' :
            status.toLowerCase().includes('cancel') ? '❌' : '⏳';

          results.push(
            `📦 **Order #${id} Details:**\n` +
            `• **Status:** ${badge} **${status}**\n` +
            `• **Start Count:** ${startCount}\n` +
            `• **Remains:** ${remains}\n` +
            `• **Charge:** ${charge}`
          );
        } catch (err: any) {
          if (err.message && (err.message.includes('401') || err.message.toLowerCase().includes('unauthorized'))) {
            results.push(`❌ **Order #${id}:** Panel API authorization error. Please reconnect your API key via **/setkey <YOUR_API_KEY>**.`);
          } else {
            results.push(`❌ **Order #${id}:** ${err.message || 'Unable to retrieve status. Please verify the ID.'}`);
          }
        }
      }

      return {
        matched: true,
        intent: 'order_tracking',
        reply: results.join('\n\n')
      };
    } catch (err: any) {
      return {
        matched: true,
        intent: 'order_tracking',
        reply: `❌ Could not connect to panel to track orders: ${err.message || 'Please try again shortly.'}`
      };
    }
  }

  /**
   * 4. Balance: "/balance", "my balance", "check balance", "check bal", "wallet"
   */
  static async matchBalance(
    lower: string,
    tenant: any,
    customerApiKey?: string
  ): Promise<SmmPresetResult> {
    const isBalanceQuery =
      /^\/balance/i.test(lower) ||
      /\b(my\s*bal(ance)?|check\s*bal(ance)?|account\s*bal(ance)?|wallet(\s*bal(ance)?)?|remaining\s*funds?|how\s*much\s*(money|bal(ance)?|funds?)\s*(do\s*i\s*have|left)?)\b/i.test(lower) ||
      /^(bal|balance|funds)$/i.test(lower);

    if (!isBalanceQuery) return { matched: false };

    if (!customerApiKey || !tenant.panelApiUrl) {
      return {
        matched: true,
        intent: 'balance',
        reply: `💰 **Account Balance:**\n\nTo view your private account balance directly in chat, please link your panel account first:\n\n👉 **/setkey <YOUR_API_KEY>**\n\nYou can find your API key on your [${tenant.panelApiUrl || 'panel account settings'}] page.`
      };
    }

    try {
      const client = new SmmProviderClient(tenant.panelApiUrl, customerApiKey);
      const bal = await client.getBalance();
      const numBal = Number(bal.balance);
      const formatted = !isNaN(numBal) ? numBal.toFixed(2) : bal.balance;

      return {
        matched: true,
        intent: 'balance',
        reply: `💰 **Your Account Balance:** **$${formatted} ${bal.currency || 'USD'}**\n\nReady to place an order? Use /order or search our service catalog anytime!`
      };
    } catch (err: any) {
      if (err.message && (err.message.includes('401') || err.message.toLowerCase().includes('unauthorized'))) {
        return {
          matched: true,
          intent: 'balance',
          reply: `⚠️ Your linked panel API key is unauthorized or expired. Please reconnect it using **/setkey <YOUR_API_KEY>** to view your live balance.`
        };
      }
      return {
        matched: true,
        intent: 'balance',
        reply: `⚠️ Unable to retrieve your balance: ${err.message || 'Please check your API key with /setkey.'}`
      };
    }
  }

  /**
   * 4. Payment Methods & Add Funds: "how to pay", "add funds", "crypto deposit", "paypal"
   */
  static matchPayments(lower: string, tenant: any): SmmPresetResult {
    const isPaymentQuery =
      /\b(how\s*to\s*(pay|add\s*funds|deposit)|payment\s*methods?|deposit\s*methods?|crypto\s*deposit|pay\s*with\s*(crypto|card|paypal|upi|binance))\b/i.test(lower);

    if (!isPaymentQuery) return { matched: false };

    const panelUrl = tenant.panelApiUrl || 'our website';
    const reply =
      `💳 **Supported Payment Methods:**\n\n` +
      `We support automated and instant deposits through:\n` +
      `• **Cryptocurrency:** USDT (TRC-20, BEP-20), BTC, ETH, TON, LTC\n` +
      `• **Cards & Local:** Credit / Debit Cards, UPI, Bank Transfer\n\n` +
      `🔗 To add funds to your account, please visit the **Add Funds** page on our website:\n` +
      `[${panelUrl}]`;

    return {
      matched: true,
      intent: 'payments',
      reply
    };
  }

  /**
   * 5. Refill Inquiries: "refill", "dropped", "followers drop"
   */
  static matchRefill(lower: string, tenant: any): SmmPresetResult {
    const isRefillQuery =
      /\b(refill|drop|dropped|followers?\s*drop|views?\s*drop|likes?\s*drop|refill\s*button|guarantee|warranty)\b/i.test(lower) &&
      !/(with\s*refill|no\s*refill|under)/i.test(lower);

    if (!isRefillQuery) return { matched: false };

    const reply =
      `🛡️ **Refill & Guarantee Policy:**\n\n` +
      `• Most of our guaranteed services come with a **30-Day Refill Guarantee**.\n` +
      `• If you experience any drops, simply go to your **Orders** history page on [${tenant.panelApiUrl || 'our website'}].\n` +
      `• Click the **Refill** button next to your order. The server will automatically top up your count within 1–24 hours.\n` +
      `• If an order does not have a refill button or is non-drop, please open a ticket with your Order ID.`;

    return {
      matched: true,
      intent: 'refill',
      reply
    };
  }

  /**
   * 6. Human Support Requests: "talk to human", "real person", "admin"
   */
  static matchHumanEscalation(lower: string, tenant: any): SmmPresetResult {
    const isHumanQuery =
      /\b(talk\s*to\s*(a\s*)?(human|person|agent|representative|manager|owner)|real\s*(person|human)|human\s*support|contact\s*(admin|owner))\b/i.test(lower);

    if (!isHumanQuery) return { matched: false };

    return {
      matched: true,
      intent: 'human_escalation',
      escalated: true,
      reply:
        `👤 **Human Support Escalation:**\n\n` +
        `I have flagged this conversation for our human support team. A representative will review your inquiry and reply as soon as possible.\n\n` +
        `In the meantime, you can leave any order IDs or questions here so we can help you right away!`
    };
  }

  /**
   * 7. Courtesies & Closings: "thanks", "thx", "ok", "tq", "bye"
   */
  static matchCourtesy(lower: string, tone?: string): SmmPresetResult {
    const isCourtesy =
      /^(thanks|thank\s*you|thx|tq|ty|ok|okay|k|cool|great|awesome|bye|goodbye|see\s*ya)\b/i.test(lower) &&
      lower.split(/\s+/).length <= 4;

    if (!isCourtesy) return { matched: false };

    const reply =
      tone === 'short'
        ? `You're welcome! Let me know if you need anything else.`
        : `You're very welcome! 🚀 Feel free to ask whenever you need help with your orders or services. Have a fantastic day!`;

    return {
      matched: true,
      intent: 'courtesy',
      reply
    };
  }
}

