/**
 * Cryptomus Crypto Payment Gateway Service
 * Handles crypto checkout session creation (USDT TRC20, TON, BTC, ETH) and cryptographic webhook signature verification.
 * Source: https://doc.cryptomus.com/
 */
import crypto from 'crypto';

export interface CryptomusCreatePaymentOptions {
  amount: number;
  orderId: string;
  urlCallback: string;
  urlReturn: string;
  urlSuccess: string;
  currency?: string;
  description?: string;
}

export interface CryptomusPaymentResult {
  uuid: string;
  orderId: string;
  amount: string;
  url: string;
  expiredAt?: number;
  status: string;
  isMock?: boolean;
}

export class CryptomusService {
  private static instance: CryptomusService | null = null;
  private merchantId: string;
  private paymentKey: string;
  private readonly apiUrl = 'https://api.cryptomus.com/v1';

  private constructor() {
    this.merchantId = process.env.CRYPTOMUS_MERCHANT_ID?.trim() || '';
    this.paymentKey = process.env.CRYPTOMUS_PAYMENT_KEY?.trim() || '';
  }

  public static getInstance(): CryptomusService {
    if (!CryptomusService.instance) {
      CryptomusService.instance = new CryptomusService();
    }
    return CryptomusService.instance;
  }

  /**
   * Checks whether live Cryptomus credentials are configured in environment
   */
  public isConfigured(): boolean {
    return Boolean(this.merchantId && this.paymentKey);
  }

  /**
   * Generates MD5 signature required by Cryptomus API
   * Sign = MD5(Base64(JSON_STRING) + PAYMENT_KEY)
   */
  public generateSignature(data: Record<string, any>, customKey?: string): string {
    const key = customKey ?? this.paymentKey;
    const jsonStr = JSON.stringify(data);
    const base64Data = Buffer.from(jsonStr).toString('base64');
    return crypto.createHash('md5').update(base64Data + key).digest('hex');
  }

  /**
   * Verifies the cryptographic signature of incoming Cryptomus webhook
   */
  public verifyWebhookSignature(payload: Record<string, any>, receivedSign?: string, customKey?: string): boolean {
    const key = customKey ?? this.paymentKey;
    if (!key) return false;

    // Signature can be provided directly or inside payload.sign
    const sign = receivedSign || payload.sign;
    if (!sign || typeof sign !== 'string') return false;

    // Create a copy of payload without the 'sign' field
    const payloadCopy = { ...payload };
    delete payloadCopy.sign;

    // Cryptomus signature: MD5(Base64(JSON.stringify(data)) + key)
    const expectedSign = this.generateSignature(payloadCopy, key);

    try {
      const bufExpected = Buffer.from(expectedSign, 'hex');
      const bufReceived = Buffer.from(sign, 'hex');
      if (bufExpected.length !== bufReceived.length) return false;
      return crypto.timingSafeEqual(bufExpected, bufReceived);
    } catch {
      return false;
    }
  }

  /**
   * Creates a payment invoice on Cryptomus
   */
  public async createPayment(options: CryptomusCreatePaymentOptions): Promise<CryptomusPaymentResult> {
    const { amount, orderId, urlCallback, urlReturn, urlSuccess, currency = 'USD', description } = options;

    if (!this.isConfigured()) {
      // Sandbox fallback mode when live keys are not configured yet
      console.log(`[Cryptomus] Merchant credentials unconfigured. Generating sandbox invoice for order: ${orderId}`);
      const mockUuid = `mock-${crypto.randomUUID()}`;
      return {
        uuid: mockUuid,
        orderId,
        amount: amount.toFixed(2),
        url: `${urlReturn || '/dashboard.html'}?mockPaymentOrderId=${encodeURIComponent(orderId)}&mockAmount=${amount.toFixed(2)}`,
        expiredAt: Math.floor(Date.now() / 1000) + 3600,
        status: 'pending',
        isMock: true
      };
    }

    const payload = {
      amount: amount.toFixed(2),
      currency,
      order_id: orderId,
      url_callback: urlCallback,
      url_return: urlReturn,
      url_success: urlSuccess,
      is_payment_multiple: false,
      lifetime: 3600,
      additional_data: description || `YourSMMagent Plan Subscription (${orderId})`
    };

    const signature = this.generateSignature(payload);

    try {
      const response = await fetch(`${this.apiUrl}/payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'merchant': this.merchantId,
          'sign': signature
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json() as any;

      if (!response.ok || data.state !== 0 || !data.result) {
        throw new Error(`Cryptomus API error (${response.status}): ${data.message || JSON.stringify(data)}`);
      }

      return {
        uuid: data.result.uuid,
        orderId: data.result.order_id,
        amount: data.result.amount,
        url: data.result.url,
        expiredAt: data.result.expired_at,
        status: data.result.status || 'process',
        isMock: false
      };
    } catch (err: any) {
      console.error('[Cryptomus] Failed to create payment:', err.message);
      throw err;
    }
  }
}

export const cryptomusService = CryptomusService.getInstance();

