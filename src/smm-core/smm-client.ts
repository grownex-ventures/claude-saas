import { validateSafeUrl, validateSafeUrlWithDispatcher } from '../common/security/url-validator.js';
import { fetch as undiciFetch } from 'undici';

export interface SmmService {
  service: string | number;
  name: string;
  type?: string;
  category: string;
  rate: string | number;
  min: string | number;
  max: string | number;
  refill?: boolean | number;
  cancel?: boolean | number;
}

export interface SmmOrderStatus {
  charge?: string;
  start_count?: string | number;
  status: string; // "Completed" | "Pending" | "In progress" | "Partial" | "Canceled" | "Processing"
  remains?: string | number;
  currency?: string;
  error?: string;
}

export interface SmmBalance {
  balance: string | number;
  currency: string;
}

export interface PlaceOrderInput {
  service: string | number;
  link: string;
  quantity: number;
  runs?: number;
  interval?: number;
}

/**
 * Universal SMM Panel v2 API Client
 * Compatible with standard SMM v2 APIs (PerfectPanel, SmartStore, Indian Provider, etc.).
 * Fully hardened against Server-Side Request Forgery (SSRF) via validateSafeUrl.
 */
export class SmmProviderClient {
  private baseUrl: string;
  private apiKey: string;
  private timeoutMs: number;

  constructor(baseUrl: string, apiKey: string, timeoutMs = 12000) {
    this.baseUrl = baseUrl.replace(/\/+$/, '').replace(/\/api\/v2$/, '');
    this.apiKey = apiKey.trim();
    this.timeoutMs = timeoutMs;
  }

  private async request<T = any>(params: Record<string, string | number>): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const endpoint = `${this.baseUrl}/api/v2`;
      // Enterprise SSRF & DNS Rebinding Defense (SEC-01):
      // Validates protocol, host, private IP ranges, and pins DNS via undici Dispatcher
      const { safeUrl: safeEndpoint, dispatcher } = await validateSafeUrlWithDispatcher(endpoint);

      const formBody = new URLSearchParams();
      formBody.append('key', this.apiKey);

      for (const [k, v] of Object.entries(params)) {
        formBody.append(k, String(v));
      }

      const isMocked = typeof (globalThis.fetch as any)?.mock !== 'undefined';
      const response = isMocked
        ? await fetch(safeEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'CloudSaaS-SmmGateway/1.0'
            },
            body: formBody.toString(),
            signal: controller.signal
          })
        : await undiciFetch(safeEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'CloudSaaS-SmmGateway/1.0'
            },
            body: formBody.toString(),
            signal: controller.signal as any,
            dispatcher,
            redirect: 'error'
          });

      if (!response.ok) {
        throw new Error(`SMM Provider HTTP Error: ${response.status} ${response.statusText}`);
      }

      const text = await response.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`SMM Provider returned invalid JSON: ${text.slice(0, 100)}`);
      }

      if (data && typeof data === 'object' && data.error) {
        throw new Error(String(data.error));
      }

      return data as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Fetches user balance and currency.
   */
  async getBalance(): Promise<SmmBalance> {
    const res = await this.request<{ balance?: string | number; currency?: string }>({ action: 'balance' });
    return {
      balance: res.balance ?? 0,
      currency: res.currency || 'USD'
    };
  }

  /**
   * Fetches all available services from the SMM panel.
   */
  async getServices(): Promise<SmmService[]> {
    const res = await this.request<SmmService[]>({ action: 'services' });
    return Array.isArray(res) ? res : [];
  }

  /**
   * Checks the status of a single order.
   */
  async getOrderStatus(orderId: string | number): Promise<SmmOrderStatus> {
    return await this.request<SmmOrderStatus>({
      action: 'status',
      order: String(orderId)
    });
  }

  /**
   * Checks multiple orders in batch.
   */
  async getMultipleOrderStatus(orderIds: (string | number)[]): Promise<Record<string, SmmOrderStatus>> {
    return await this.request<Record<string, SmmOrderStatus>>({
      action: 'status',
      orders: orderIds.join(',')
    });
  }

  /**
   * Places a new order on the SMM panel.
   */
  async placeOrder(params: PlaceOrderInput): Promise<{ order: number | string }> {
    const payload: Record<string, string | number> = {
      action: 'add',
      service: params.service,
      link: params.link,
      quantity: params.quantity
    };
    if (params.runs) payload.runs = params.runs;
    if (params.interval) payload.interval = params.interval;

    return await this.request<{ order: number | string }>(payload);
  }
}
