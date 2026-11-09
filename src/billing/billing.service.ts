/**
 * Billing & Subscription Service
 * Manages automated crypto subscriptions, invoice creation, price calculation,
 * and webhook processing to unlock channels and activate tenant subscriptions.
 */
import { prisma } from '../common/database/prisma.js';
import { redis } from '../common/redis/redis.js';
import { tenantStatusKey } from '../common/redis/keys.js';
import { cryptomusService } from './cryptomus.service.js';
import { AuditLogService } from '../common/audit/audit-log.service.js';
import { InvoiceStatus } from '@prisma/client';
import crypto from 'crypto';

export const CHANNEL_PRICES: Record<string, number> = {
  telegram: 19,
  whatsapp: 29,
  widget: 15,
};

export const ALL_IN_ONE_BUNDLE_PRICE = 49;

export interface PriceCalculationResult {
  channels: string[];
  durationMonths: number;
  monthlyBasePrice: number;
  isBundle: boolean;
  discountPercentage: number;
  totalAmount: number;
}

export interface CreateInvoiceOptions {
  tenantId: string;
  channels: string[];
  durationMonths?: number;
  baseUrl?: string;
}

export class BillingService {
  private static instance: BillingService | null = null;

  private constructor() {}

  public static getInstance(): BillingService {
    if (!BillingService.instance) {
      BillingService.instance = new BillingService();
    }
    return BillingService.instance;
  }

  /**
   * Calculates subscription pricing with bundle detection and multi-month duration discounts.
   */
  public calculatePrice(channels: string[], durationMonths = 1): PriceCalculationResult {
    const validChannels = Array.from(new Set(channels.map((c) => c.toLowerCase().trim()))).filter(
      (c) => c === 'telegram' || c === 'whatsapp' || c === 'widget'
    );

    if (validChannels.length === 0) {
      throw new Error('At least one valid channel (telegram, whatsapp, widget) must be selected');
    }

    const months = Math.max(1, Math.min(36, Math.floor(durationMonths)));

    const isBundle = validChannels.includes('telegram') && validChannels.includes('whatsapp') && validChannels.includes('widget');

    let monthlyBasePrice = 0;
    if (isBundle) {
      monthlyBasePrice = ALL_IN_ONE_BUNDLE_PRICE;
    } else {
      for (const ch of validChannels) {
        monthlyBasePrice += CHANNEL_PRICES[ch] || 0;
      }
    }

    let discountPercentage = 0;
    if (months >= 12) {
      discountPercentage = 20; // 20% off for 12+ months
    } else if (months >= 6) {
      discountPercentage = 15; // 15% off for 6+ months
    } else if (months >= 3) {
      discountPercentage = 10; // 10% off for 3+ months
    }

    const rawTotal = monthlyBasePrice * months * (1 - discountPercentage / 100);
    const totalAmount = Math.round(rawTotal * 100) / 100;

    return {
      channels: validChannels,
      durationMonths: months,
      monthlyBasePrice,
      isBundle,
      discountPercentage,
      totalAmount
    };
  }

  /**
   * Creates a new pending payment invoice and generates a crypto checkout session.
   */
  public async createInvoice(options: CreateInvoiceOptions): Promise<any> {
    const { tenantId, channels, durationMonths = 1, baseUrl } = options;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, email: true, subscriptionStatus: true }
    });

    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    const pricing = this.calculatePrice(channels, durationMonths);
    const appUrl = (baseUrl || process.env.APP_URL || 'https://app.yoursmmagent.com').replace(/\/+$/, '');

    // Generate unique order ID: INV-<timestamp>-<random4hex>
    const orderId = `INV-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    // Create invoice record in Postgres
    const invoice = await prisma.paymentInvoice.create({
      data: {
        tenantId,
        orderId,
        gateway: 'cryptomus',
        amount: pricing.totalAmount,
        currency: 'USD',
        selectedChannels: pricing.channels,
        durationMonths: pricing.durationMonths,
        status: InvoiceStatus.PENDING,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1-hour invoice lifetime
      }
    });

    const urlCallback = `${appUrl}/api/billing/webhook/cryptomus`;
    const urlReturn = `${appUrl}/dashboard/billing`;
    const urlSuccess = `${appUrl}/dashboard/billing?paidOrderId=${orderId}`;

    try {
      const payment = await cryptomusService.createPayment({
        amount: pricing.totalAmount,
        orderId,
        urlCallback,
        urlReturn,
        urlSuccess,
        currency: 'USD',
        description: `YourSMMagent Plan (${pricing.channels.join(', ')}) - ${pricing.durationMonths} mo`
      });

      // Update invoice with gateway payment ID and checkout URL
      const updated = await prisma.paymentInvoice.update({
        where: { id: invoice.id },
        data: {
          gatewayPaymentId: payment.uuid,
          paymentUrl: payment.url
        }
      });

      return {
        success: true,
        invoice: {
          id: updated.id,
          orderId: updated.orderId,
          amount: Number(updated.amount).toFixed(2),
          currency: updated.currency,
          channels: updated.selectedChannels,
          durationMonths: updated.durationMonths,
          status: updated.status,
          paymentUrl: updated.paymentUrl,
          expiresAt: updated.expiresAt,
          isMock: payment.isMock || false
        }
      };
    } catch (err: any) {
      await prisma.paymentInvoice.update({
        where: { id: invoice.id },
        data: { status: InvoiceStatus.FAILED }
      });
      throw new Error(`Failed to generate crypto payment session: ${err.message}`);
    }
  }

  /**
   * Private idempotent invoice payment activation shared by all trusted entry points.
   */
  private async activateInvoicePayment(
    invoice: any,
    details: { gateway: string; paidAt?: Date; externalId?: string; actorIp?: string; adminId?: string }
  ): Promise<{ success: boolean; message: string }> {
    if (invoice.status === InvoiceStatus.PAID) {
      return { success: true, message: 'Invoice already marked as paid' };
    }

    const channels = (invoice.selectedChannels as string[]) || [];
    const durationDays = (invoice.durationMonths || 1) * 30;

    // Calculate new expiration date
    const now = details.paidAt || new Date();
    let expiresAt: Date;
    if (invoice.tenant.subscriptionExpiresAt && invoice.tenant.subscriptionExpiresAt > now) {
      expiresAt = new Date(invoice.tenant.subscriptionExpiresAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
    } else {
      expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
    }

    // Determine channel updates
    const hasTelegram = channels.includes('telegram') ? true : invoice.tenant.hasTelegram;
    const hasWhatsapp = channels.includes('whatsapp') ? true : invoice.tenant.hasWhatsapp;
    const hasWidget = channels.includes('widget') ? true : invoice.tenant.hasWidget;

    // Update invoice and tenant inside a database transaction
    await prisma.$transaction([
      prisma.paymentInvoice.update({
        where: { id: invoice.id },
        data: {
          status: InvoiceStatus.PAID,
          paidAt: now,
          ...(details.externalId ? { gatewayPaymentId: details.externalId } : {})
        }
      }),
      prisma.tenant.update({
        where: { id: invoice.tenantId },
        data: {
          subscriptionStatus: 'ACTIVE',
          subscriptionExpiresAt: expiresAt,
          hasTelegram,
          hasWhatsapp,
          hasWidget
        }
      })
    ]);

    // Cache active subscription in Redis using canonical key and standard 3600s TTL (best-effort resilience)
    try {
      await redis.set(tenantStatusKey(invoice.tenantId), 'ACTIVE', 'EX', 3600);
    } catch (err: any) {
      console.warn('[BillingService] Failed to cache subscription status in Redis:', err.message);
    }

    // Audit log
    await AuditLogService.record({
      tenantId: invoice.tenantId,
      action: details.adminId ? 'SUBSCRIPTION_ADMIN_APPROVAL' : 'SUBSCRIPTION_PAID_CRYPTO',
      actorIp: details.actorIp || (details.adminId ? 'admin-override' : 'cryptomus-webhook'),
      metadata: {
        orderId: invoice.orderId,
        amount: invoice.amount,
        channels,
        durationMonths: invoice.durationMonths,
        expiresAt: expiresAt.toISOString(),
        gateway: details.gateway,
        adminId: details.adminId || null
      }
    });

    console.log(`[BillingService] ✅ Subscription activated for tenant ${invoice.tenantId} (${details.gateway}). Channels: [${channels.join(', ')}]. Expires: ${expiresAt.toISOString()}`);
    return { success: true, message: 'Payment confirmed and subscription activated' };
  }

  /**
   * Processes incoming Cryptomus webhook (Fail-Closed)
   */
  public async handleCryptomusWebhook(payload: Record<string, any>, signature?: string): Promise<{ success: boolean; message: string }> {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid webhook payload');
    }

    // Fail-closed: Real webhook processing REQUIRES configured credentials
    if (!cryptomusService.isConfigured()) {
      throw new Error('Cryptomus gateway is not configured');
    }

    // Verify cryptographic signature
    const isValid = cryptomusService.verifyWebhookSignature(payload, signature);
    if (!isValid) {
      console.warn('[BillingService] Cryptomus webhook signature verification failed.');
      throw new Error('Invalid signature');
    }

    const orderId = payload.order_id || payload.orderId;
    const paymentStatus = (payload.status || payload.payment_status || '').toLowerCase();

    if (!orderId) {
      throw new Error('Missing order_id in webhook payload');
    }

    const invoice = await prisma.paymentInvoice.findUnique({
      where: { orderId },
      include: { tenant: true }
    });

    if (!invoice) {
      throw new Error(`Invoice with orderId ${orderId} not found`);
    }

    // Prevent duplicate processing
    if (invoice.status === InvoiceStatus.PAID) {
      return { success: true, message: 'Invoice already marked as paid' };
    }

    // Successful payment status from Cryptomus: 'paid' or 'paid_over'
    const isPaid = paymentStatus === 'paid' || paymentStatus === 'paid_over' || paymentStatus === 'success';

    if (isPaid) {
      return this.activateInvoicePayment(invoice, {
        gateway: 'cryptomus',
        externalId: payload.uuid,
        actorIp: 'cryptomus-webhook'
      });
    }

    if (paymentStatus === 'cancel' || paymentStatus === 'fail') {
      await prisma.paymentInvoice.update({
        where: { id: invoice.id },
        data: { status: InvoiceStatus.CANCELLED }
      });
      return { success: true, message: 'Invoice marked as cancelled' };
    }

    return { success: true, message: `Webhook processed with status: ${paymentStatus}` };
  }

  /**
   * Explicit Admin Approval Method (Reachable only via guarded admin route)
   */
  public async markInvoicePaidByAdmin(orderId: string, adminId?: string): Promise<{ success: boolean; message: string }> {
    const invoice = await prisma.paymentInvoice.findUnique({
      where: { orderId },
      include: { tenant: true }
    });

    if (!invoice) {
      const err: any = new Error(`Invoice with orderId ${orderId} not found`);
      err.statusCode = 404;
      throw err;
    }

    return this.activateInvoicePayment(invoice, {
      gateway: 'admin_override',
      adminId,
      actorIp: 'admin-override'
    });
  }

  /**
   * Sandbox simulation for non-production environments with strict guardrails
   */
  public async simulateMockPayment(tenantId: string, orderId: string): Promise<{ success: boolean; message: string }> {
    if (process.env.NODE_ENV === 'production') {
      const err: any = new Error('Sandbox simulation is disabled in production');
      err.statusCode = 404;
      throw err;
    }

    if (cryptomusService.isConfigured()) {
      const err: any = new Error('Mock simulation is disabled because live Cryptomus gateway is configured');
      err.statusCode = 409;
      throw err;
    }

    const invoice = await prisma.paymentInvoice.findUnique({
      where: { orderId },
      include: { tenant: true }
    });

    if (!invoice) {
      const err: any = new Error(`Invoice with orderId ${orderId} not found`);
      err.statusCode = 404;
      throw err;
    }

    if (invoice.tenantId !== tenantId) {
      const err: any = new Error('Forbidden: Invoice belongs to another tenant');
      err.statusCode = 403;
      throw err;
    }

    if (invoice.status !== InvoiceStatus.PENDING) {
      const err: any = new Error(`Invoice cannot be simulated because status is ${invoice.status}`);
      err.statusCode = 400;
      throw err;
    }

    if (invoice.expiresAt && invoice.expiresAt < new Date()) {
      const err: any = new Error('Invoice has expired');
      err.statusCode = 400;
      throw err;
    }

    return this.activateInvoicePayment(invoice, {
      gateway: 'sandbox_mock',
      actorIp: 'sandbox-simulation'
    });
  }

  /**
   * Retrieves tenant invoices with fixed 2-decimal string amounts
   */
  public async getTenantInvoices(tenantId: string): Promise<any[]> {
    const invoices = await prisma.paymentInvoice.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    return invoices.map((inv) => ({
      ...inv,
      amount: Number(inv.amount).toFixed(2)
    }));
  }

  /**
   * Checks status of an invoice with fixed 2-decimal string amounts
   */
  public async getInvoiceStatus(tenantId: string, orderId: string): Promise<any> {
    const invoice = await prisma.paymentInvoice.findFirst({
      where: { tenantId, orderId }
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    return {
      orderId: invoice.orderId,
      status: invoice.status,
      amount: Number(invoice.amount).toFixed(2),
      currency: invoice.currency,
      channels: invoice.selectedChannels,
      paymentUrl: invoice.paymentUrl,
      paidAt: invoice.paidAt,
      expiresAt: invoice.expiresAt
    };
  }

  /**
   * Retrieves comprehensive real billing summary for tenant
   */
  public async getBillingSummary(tenantId: string): Promise<any> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        email: true,
        subscriptionStatus: true,
        subscriptionExpiresAt: true,
        hasTelegram: true,
        hasWhatsapp: true,
        hasWidget: true,
        botToken: true,
        whatsAppEnabled: true,
        widgetEnabled: true,
        createdAt: true,
      }
    });

    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [tgCount, waCount, webCount, invoices] = await Promise.all([
      prisma.telegramChatMessage.count({
        where: { tenantId, createdAt: { gte: startOfMonth } }
      }),
      prisma.whatsAppChatMessage.count({
        where: { tenantId, createdAt: { gte: startOfMonth } }
      }),
      prisma.webChatSession.count({
        where: { tenantId, createdAt: { gte: startOfMonth } }
      }),
      prisma.paymentInvoice.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 50
      })
    ]);

    const conversationsCount = tgCount + waCount + webCount;
    const lookupsCount = conversationsCount * 3;

    let activeChannelsCount = 0;
    if (tenant.hasTelegram && tenant.botToken) activeChannelsCount++;
    if (tenant.hasWhatsapp && tenant.whatsAppEnabled) activeChannelsCount++;
    if (tenant.hasWidget && tenant.widgetEnabled) activeChannelsCount++;

    const isTrial = tenant.subscriptionStatus === 'INACTIVE' &&
      (Date.now() - tenant.createdAt.getTime() < 14 * 24 * 60 * 60 * 1000);

    const trialEndsAt = new Date(tenant.createdAt.getTime() + 14 * 24 * 60 * 60 * 1000).getTime();

    const planId = (tenant.hasTelegram && tenant.hasWhatsapp && tenant.hasWidget)
      ? 'pro'
      : (tenant.hasTelegram ? 'starter' : 'pro');

    const formattedInvoices = invoices.map((inv: any) => ({
      id: inv.orderId,
      date: inv.createdAt.getTime(),
      description: `YourSMMagent Plan (${Array.isArray(inv.selectedChannels) ? (inv.selectedChannels as string[]).join(', ') : 'channels'}) · ${inv.durationMonths || 1} mo`,
      amount: Number(inv.amount),
      status: inv.status === InvoiceStatus.PAID ? 'Paid' : inv.status === InvoiceStatus.PENDING ? 'Pending' : inv.status,
      paymentUrl: inv.paymentUrl,
      gateway: inv.gateway,
      durationMonths: inv.durationMonths,
      selectedChannels: inv.selectedChannels
    }));

    return {
      success: true,
      subscriptionStatus: tenant.subscriptionStatus,
      subscriptionExpiresAt: tenant.subscriptionExpiresAt ? tenant.subscriptionExpiresAt.getTime() : null,
      isTrial,
      trialEndsAt,
      planId,
      channels: {
        telegram: Boolean(tenant.hasTelegram),
        whatsapp: Boolean(tenant.hasWhatsapp),
        widget: Boolean(tenant.hasWidget)
      },
      usage: {
        conversations: conversationsCount,
        lookups: lookupsCount,
        activeChannels: activeChannelsCount
      },
      invoices: formattedInvoices
    };
  }
}

export const billingService = BillingService.getInstance();
