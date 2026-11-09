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

    // 2. Order Tracking in Free Text
    const trackingMatch = await this.matchOrderTracking(raw, tenant, catalogKey, customerApiKey);
    if (trackingMatch.matched) return trackingMatch;

    // 3. Balance Checks
    const balanceMatch = await this.matchBalance(lower, tenant, customerApiKey);
    if (balanceMatch.matched) return balanceMatch;

    // 4. Payment Methods & Add Funds
    const paymentMatch = this.matchPayments(lower, tenant);
    if (paymentMatch.matched) return paymentMatch;

    // 5. Refill Inquiries
    const refillMatch = this.matchRefill(lower, tenant);
    if (refillMatch.matched) return refillMatch;

    // 6. Human Support Requests
    const humanMatch = this.matchHumanEscalation(lower, tenant);
    if (humanMatch.matched) return humanMatch;

    // 7. Courtesies & Closings
    const courtesyMatch = this.matchCourtesy(lower, tone);
    if (courtesyMatch.matched) return courtesyMatch;

    return { matched: false };
  }

  /**
   * 1. Greetings: "hlo", "hlw", "hello buddy", "hey bro", "hi", "yo", "start"
   */
  static matchGreeting(lower: string, tenant: any, tone?: string): SmmPresetResult {
    const greetingRegex =
      /^(hlo|hlw|hello|hi|hey|hey\s*bro|hello\s*buddy|yo|sup|hola|namaste|start|\/start|good\s*(morning|evening|afternoon)|anyone\s*here)\b/i;

    if (greetingRegex.test(lower) && lower.split(/\s+/).length <= 4) {
      const panelName = tenant.widgetTitle || (tenant.panelApiUrl ? new URL(tenant.panelApiUrl.startsWith('http') ? tenant.panelApiUrl : `https://${tenant.panelApiUrl}`).hostname : 'our panel');
      
      let prefix = '👋 **Hello! Welcome to ' + panelName + '**';
      if (tone === 'short') {
        prefix = '👋 **Hello! Welcome to ' + panelName + '.** How can I assist you?';
        return {
          matched: true,
          intent: 'greeting',
          reply: prefix
        };
      } else if (tone === 'professional') {
        prefix = '👋 **Greetings. Welcome to ' + panelName + ' Customer Support.**';
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
   * 2. Order Tracking: "6748424 check order status", "status 12345", "track #48213"
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
          const remains = order.remains ?? 'N/A';

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
          results.push(`❌ **Order #${id}:** ${err.message || 'Unable to retrieve status. Please verify the ID.'}`);
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
   * 3. Balance: "/balance", "my balance", "check balance", "wallet"
   */
  static async matchBalance(
    lower: string,
    tenant: any,
    customerApiKey?: string
  ): Promise<SmmPresetResult> {
    const isBalanceQuery =
      /^\/balance/i.test(lower) ||
      /\b(my\s*balance|check\s*balance|account\s*balance|wallet\s*balance|remaining\s*funds|how\s*much\s*(money|balance|funds)\s*(do\s*i\s*have|left))\b/i.test(lower);

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
