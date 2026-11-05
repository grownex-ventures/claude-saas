import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cryptomusService } from '../src/billing/cryptomus.service.js';
import { billingService, CHANNEL_PRICES, ALL_IN_ONE_BUNDLE_PRICE } from '../src/billing/billing.service.js';
import { prisma } from '../src/common/database/prisma.js';
import { redis } from '../src/common/redis/redis.js';
import { InvoiceStatus } from '@prisma/client';
import { billingController } from '../src/billing/billing.controller.js';

describe('Crypto Billing & Subscription Suite', () => {
  const tenantId = 'test-tenant-billing-uuid';
  const otherTenantId = 'other-tenant-uuid';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Pricing Calculation Engine', () => {
    it('calculates single channel prices correctly for 1 month', () => {
      const tg = billingService.calculatePrice(['telegram'], 1);
      expect(tg.totalAmount).toBe(19);
      expect(tg.isBundle).toBe(false);
      expect(tg.discountPercentage).toBe(0);

      const wa = billingService.calculatePrice(['whatsapp'], 1);
      expect(wa.totalAmount).toBe(29);

      const widget = billingService.calculatePrice(['widget'], 1);
      expect(widget.totalAmount).toBe(15);
    });

    it('calculates combinations of channels correctly', () => {
      const combo = billingService.calculatePrice(['telegram', 'whatsapp'], 1);
      expect(combo.totalAmount).toBe(48); // 19 + 29
      expect(combo.isBundle).toBe(false);
    });

    it('automatically applies All-in-One bundle pricing when all 3 channels are selected', () => {
      const bundle = billingService.calculatePrice(['telegram', 'whatsapp', 'widget'], 1);
      expect(bundle.isBundle).toBe(true);
      expect(bundle.totalAmount).toBe(49); // Saves $14 over 19 + 29 + 15 = 63
    });

    it('applies multi-month duration discounts correctly', () => {
      // 3 months -> 10% off
      const threeMo = billingService.calculatePrice(['telegram'], 3);
      expect(threeMo.totalAmount).toBe(51.3);
      expect(threeMo.discountPercentage).toBe(10);

      // 6 months -> 15% off
      const sixMo = billingService.calculatePrice(['telegram'], 6);
      expect(sixMo.totalAmount).toBe(96.9);
      expect(sixMo.discountPercentage).toBe(15);

      // 12 months -> 20% off
      const twelveMo = billingService.calculatePrice(['telegram', 'whatsapp', 'widget'], 12);
      expect(twelveMo.totalAmount).toBe(470.4);
      expect(twelveMo.discountPercentage).toBe(20);
    });

    it('throws error when channels array is empty or has invalid channels', () => {
      expect(() => billingService.calculatePrice([], 1)).toThrow('At least one valid channel');
      expect(() => billingService.calculatePrice(['invalid_channel'], 1)).toThrow('At least one valid channel');
    });
  });

  describe('Cryptomus Cryptographic Signature Engine', () => {
    const testKey = 'test_cryptomus_api_key_12345';

    it('creates invoice in Postgres and returns checkout details with 2-decimal string', async () => {
      vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce({
        id: tenantId,
        email: 'billing-test@example.com',
        subscriptionStatus: 'INACTIVE'
      } as any);

      const mockCreatedInvoice = {
        id: 'inv-uuid-1',
        tenantId,
        orderId: 'INV-TEST-123',
        gateway: 'cryptomus',
        amount: 19.0,
        currency: 'USD',
        selectedChannels: ['telegram'],
        durationMonths: 1,
        status: InvoiceStatus.PENDING,
        paymentUrl: null,
        expiresAt: new Date(Date.now() + 3600000),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(prisma.paymentInvoice, 'create').mockResolvedValueOnce(mockCreatedInvoice as any);
      vi.spyOn(prisma.paymentInvoice, 'update').mockResolvedValueOnce({
        ...mockCreatedInvoice,
        paymentUrl: '/dashboard.html?mockPaymentOrderId=INV-TEST-123'
      } as any);

      const result = await billingService.createInvoice({
        tenantId,
        channels: ['telegram'],
        durationMonths: 1,
        baseUrl: 'https://app.yoursmmagent.com'
      });

      expect(result.success).toBe(true);
      expect(result.invoice.orderId).toBe('INV-TEST-123');
      expect(result.invoice.amount).toBe('19.00');
      expect(result.invoice.channels).toEqual(['telegram']);
    });

    it('generates reproducible MD5 signatures', () => {
      const payload = { amount: '19.00', currency: 'USD', order_id: 'INV-123' };
      const sig1 = cryptomusService.generateSignature(payload, testKey);
      const sig2 = cryptomusService.generateSignature(payload, testKey);
      expect(sig1).toBe(sig2);
      expect(typeof sig1).toBe('string');
      expect(sig1.length).toBe(32);
    });

    it('verifies valid webhook payload signature successfully', () => {
      const payload = {
        amount: '19.00',
        currency: 'USD',
        order_id: 'INV-TEST-SIGN',
        status: 'paid'
      };
      const sign = cryptomusService.generateSignature(payload, testKey);

      const isValid = cryptomusService.verifyWebhookSignature({ ...payload, sign }, sign, testKey);
      expect(isValid).toBe(true);
    });

    it('rejects tampered webhook payloads', () => {
      const payload = {
        amount: '19.00',
        currency: 'USD',
        order_id: 'INV-TEST-TAMPER',
        status: 'paid'
      };
      const sign = cryptomusService.generateSignature(payload, testKey);

      const tamperedPayload = { ...payload, amount: '1.00', sign };
      const isValid = cryptomusService.verifyWebhookSignature(tamperedPayload, sign, testKey);
      expect(isValid).toBe(false);
    });
  });

  describe('Fail-Closed Webhook Processing (Phase 2)', () => {
    it('fails closed and rejects webhook if Cryptomus is not configured', async () => {
      vi.spyOn(cryptomusService, 'isConfigured').mockReturnValue(false);

      await expect(
        billingService.handleCryptomusWebhook({
          order_id: 'INV-FAIL-CLOSED',
          status: 'paid'
        })
      ).rejects.toThrow(/Cryptomus gateway is not configured/);
    });

    it('fails closed and rejects webhook with missing or invalid signature when configured', async () => {
      vi.spyOn(cryptomusService, 'isConfigured').mockReturnValue(true);
      vi.spyOn(cryptomusService, 'verifyWebhookSignature').mockReturnValue(false);

      await expect(
        billingService.handleCryptomusWebhook(
          { order_id: 'INV-BAD-SIGN', status: 'paid' },
          'invalid_signature'
        )
      ).rejects.toThrow(/Invalid signature/);
    });

    it('activates tenant subscription exactly once with a valid signed webhook', async () => {
      vi.spyOn(cryptomusService, 'isConfigured').mockReturnValue(true);
      vi.spyOn(cryptomusService, 'verifyWebhookSignature').mockReturnValue(true);

      const orderId = 'INV-VALID-SIGNED-1';
      const existingInvoice = {
        id: 'inv-uuid-valid',
        tenantId,
        orderId,
        amount: 49.0,
        durationMonths: 1,
        selectedChannels: ['telegram', 'whatsapp', 'widget'],
        status: InvoiceStatus.PENDING,
        tenant: {
          id: tenantId,
          email: 'paid-tenant@example.com',
          subscriptionStatus: 'INACTIVE',
          subscriptionExpiresAt: null,
          hasTelegram: false,
          hasWhatsapp: false,
          hasWidget: false
        }
      };

      vi.spyOn(prisma.paymentInvoice, 'findUnique').mockResolvedValueOnce(existingInvoice as any);
      vi.spyOn(prisma.paymentInvoice, 'update').mockResolvedValueOnce({} as any);
      vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce({} as any);
      const txSpy = vi.spyOn(prisma, '$transaction').mockResolvedValueOnce([
        { ...existingInvoice, status: InvoiceStatus.PAID },
        { ...existingInvoice.tenant, subscriptionStatus: 'ACTIVE', hasTelegram: true, hasWhatsapp: true, hasWidget: true }
      ] as any);
      vi.spyOn(redis, 'set').mockResolvedValue('OK' as any);

      const result = await billingService.handleCryptomusWebhook(
        { order_id: orderId, status: 'paid' },
        'valid_signature_123'
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('Payment confirmed');
      expect(txSpy).toHaveBeenCalledTimes(1);

      // Replay verification: second attempt with status PAID must not call $transaction
      vi.spyOn(prisma.paymentInvoice, 'findUnique').mockResolvedValueOnce({
        ...existingInvoice,
        status: InvoiceStatus.PAID
      } as any);

      const replayResult = await billingService.handleCryptomusWebhook(
        { order_id: orderId, status: 'paid' },
        'valid_signature_123'
      );
      expect(replayResult.success).toBe(true);
      expect(replayResult.message).toContain('already marked as paid');
      expect(txSpy).toHaveBeenCalledTimes(1); // not called again
    });
  });

  describe('Explicit Admin Approval (Phase 2)', () => {
    it('allows admin to mark invoice as paid even when Cryptomus is configured', async () => {
      vi.spyOn(cryptomusService, 'isConfigured').mockReturnValue(true);

      const orderId = 'INV-ADMIN-OVERRIDE-1';
      const existingInvoice = {
        id: 'inv-uuid-admin',
        tenantId,
        orderId,
        amount: 19.0,
        durationMonths: 1,
        selectedChannels: ['telegram'],
        status: InvoiceStatus.PENDING,
        tenant: {
          id: tenantId,
          email: 'tenant@example.com',
          subscriptionStatus: 'INACTIVE',
          hasTelegram: false,
          hasWhatsapp: false,
          hasWidget: false
        }
      };

      vi.spyOn(prisma.paymentInvoice, 'findUnique').mockResolvedValueOnce(existingInvoice as any);
      vi.spyOn(prisma.paymentInvoice, 'update').mockResolvedValueOnce({} as any);
      vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce({} as any);
      const txSpy = vi.spyOn(prisma, '$transaction').mockResolvedValueOnce([
        { ...existingInvoice, status: InvoiceStatus.PAID },
        { ...existingInvoice.tenant, subscriptionStatus: 'ACTIVE', hasTelegram: true }
      ] as any);
      vi.spyOn(redis, 'set').mockResolvedValue('OK' as any);

      const result = await billingService.markInvoicePaidByAdmin(orderId, 'admin-user-uuid-1');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Payment confirmed');
      expect(txSpy).toHaveBeenCalled();
    });
  });

  describe('Sandbox Mock Payment Simulation Restrictions (Phase 2)', () => {
    it('returns 404 in production environment without mutating data', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        await expect(
          billingService.simulateMockPayment(tenantId, 'INV-PROD-TEST')
        ).rejects.toMatchObject({ statusCode: 404 });
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('returns 409 Conflict when Cryptomus is configured', async () => {
      vi.spyOn(cryptomusService, 'isConfigured').mockReturnValue(true);

      await expect(
        billingService.simulateMockPayment(tenantId, 'INV-CONFIGURED-GATEWAY')
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('returns 403 Forbidden if invoice belongs to another tenant', async () => {
      vi.spyOn(cryptomusService, 'isConfigured').mockReturnValue(false);

      vi.spyOn(prisma.paymentInvoice, 'findUnique').mockResolvedValueOnce({
        id: 'inv-other',
        tenantId: otherTenantId,
        orderId: 'INV-CROSS-TENANT',
        status: InvoiceStatus.PENDING,
        expiresAt: new Date(Date.now() + 3600000),
        tenant: { id: otherTenantId }
      } as any);

      await expect(
        billingService.simulateMockPayment(tenantId, 'INV-CROSS-TENANT')
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('returns 400 Bad Request if invoice is expired', async () => {
      vi.spyOn(cryptomusService, 'isConfigured').mockReturnValue(false);

      vi.spyOn(prisma.paymentInvoice, 'findUnique').mockResolvedValueOnce({
        id: 'inv-expired',
        tenantId,
        orderId: 'INV-EXPIRED',
        status: InvoiceStatus.PENDING,
        expiresAt: new Date(Date.now() - 10000), // Expired 10s ago
        tenant: { id: tenantId }
      } as any);

      await expect(
        billingService.simulateMockPayment(tenantId, 'INV-EXPIRED')
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('successfully activates in non-production when Cryptomus is unconfigured for matching tenant', async () => {
      vi.spyOn(cryptomusService, 'isConfigured').mockReturnValue(false);

      const orderId = 'INV-SANDBOX-SUCCESS';
      const existingInvoice = {
        id: 'inv-uuid-sandbox',
        tenantId,
        orderId,
        amount: 29.0,
        durationMonths: 1,
        selectedChannels: ['whatsapp'],
        status: InvoiceStatus.PENDING,
        expiresAt: new Date(Date.now() + 3600000),
        tenant: {
          id: tenantId,
          email: 'sandbox@example.com',
          subscriptionStatus: 'INACTIVE',
          hasTelegram: false,
          hasWhatsapp: false,
          hasWidget: false
        }
      };

      vi.spyOn(prisma.paymentInvoice, 'findUnique').mockResolvedValueOnce(existingInvoice as any);
      vi.spyOn(prisma.paymentInvoice, 'update').mockResolvedValueOnce({} as any);
      vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce({} as any);
      vi.spyOn(prisma, '$transaction').mockResolvedValueOnce([
        { ...existingInvoice, status: InvoiceStatus.PAID },
        { ...existingInvoice.tenant, subscriptionStatus: 'ACTIVE', hasWhatsapp: true }
      ] as any);
      vi.spyOn(redis, 'set').mockResolvedValue('OK' as any);

      const result = await billingService.simulateMockPayment(tenantId, orderId);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Payment confirmed');
    });

    it('proves unauthenticated callers cannot invoke mock payment', async () => {
      const req: any = { headers: {}, params: { orderId: 'INV-NO-AUTH' } };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();
      const { tenantAccessMiddleware } = await import('../src/common/middleware/tenant-access.middleware.js');
      tenantAccessMiddleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
