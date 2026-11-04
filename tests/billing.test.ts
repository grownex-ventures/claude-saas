import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cryptomusService } from '../src/billing/cryptomus.service.js';
import { billingService, CHANNEL_PRICES, ALL_IN_ONE_BUNDLE_PRICE } from '../src/billing/billing.service.js';
import { prisma } from '../src/common/database/prisma.js';
import { redis } from '../src/common/redis/redis.js';
import { InvoiceStatus } from '@prisma/client';

describe('Crypto Billing & Subscription Suite', () => {
  const tenantId = 'test-tenant-billing-uuid';

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
      // 19 * 3 = 57, 10% off = 51.30
      expect(threeMo.totalAmount).toBe(51.3);
      expect(threeMo.discountPercentage).toBe(10);

      // 6 months -> 15% off
      const sixMo = billingService.calculatePrice(['telegram'], 6);
      // 19 * 6 = 114, 15% off = 96.90
      expect(sixMo.totalAmount).toBe(96.9);
      expect(sixMo.discountPercentage).toBe(15);

      // 12 months -> 20% off
      const twelveMo = billingService.calculatePrice(['telegram', 'whatsapp', 'widget'], 12);
      // 49 * 12 = 588, 20% off = 470.40
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

    it('generates reproducible MD5 signatures', () => {
      const payload = { amount: '19.00', currency: 'USD', order_id: 'INV-123' };
      const sig1 = cryptomusService.generateSignature(payload, testKey);
      const sig2 = cryptomusService.generateSignature(payload, testKey);
      expect(sig1).toBe(sig2);
      expect(typeof sig1).toBe('string');
      expect(sig1.length).toBe(32); // MD5 hex length
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

      // Tamper amount to 1.00
      const tamperedPayload = { ...payload, amount: '1.00', sign };
      const isValid = cryptomusService.verifyWebhookSignature(tamperedPayload, sign, testKey);
      expect(isValid).toBe(false);
    });
  });

  describe('Invoice Creation and Webhook Processing', () => {
    it('creates invoice in Postgres and returns checkout details', async () => {
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
      expect(result.invoice.amount).toBe(19);
      expect(result.invoice.channels).toEqual(['telegram']);
    });

    it('activates tenant subscription and unlocks channels on successful payment webhook', async () => {
      const orderId = 'INV-PAID-SUCCESS-1';
      const existingInvoice = {
        id: 'inv-uuid-paid',
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
      vi.spyOn(redis, 'set').mockResolvedValueOnce('OK' as any);

      const result = await billingService.handleCryptomusWebhook({
        order_id: orderId,
        status: 'paid'
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Payment confirmed');
      expect(txSpy).toHaveBeenCalled();
      expect(redis.set).toHaveBeenCalledWith(`tenant:${tenantId}:subscription`, 'ACTIVE', 'EX', 3600);
    });

    it('prevents replay attacks on already paid invoices', async () => {
      const orderId = 'INV-ALREADY-PAID';
      vi.spyOn(prisma.paymentInvoice, 'findUnique').mockResolvedValueOnce({
        id: 'inv-already-paid-uuid',
        orderId,
        status: InvoiceStatus.PAID,
        tenant: { id: tenantId }
      } as any);
      const txSpy = vi.spyOn(prisma, '$transaction');

      const result = await billingService.handleCryptomusWebhook({
        order_id: orderId,
        status: 'paid'
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('already marked as paid');
      expect(txSpy).not.toHaveBeenCalled();
    });

    it('marks invoice cancelled when webhook status is cancel', async () => {
      const orderId = 'INV-CANCELLED-1';
      vi.spyOn(prisma.paymentInvoice, 'findUnique').mockResolvedValueOnce({
        id: 'inv-cancel-uuid',
        orderId,
        status: InvoiceStatus.PENDING,
        tenant: { id: tenantId }
      } as any);

      vi.spyOn(prisma.paymentInvoice, 'update').mockResolvedValueOnce({
        id: 'inv-cancel-uuid',
        status: InvoiceStatus.CANCELLED
      } as any);

      const result = await billingService.handleCryptomusWebhook({
        order_id: orderId,
        status: 'cancel'
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('marked as cancelled');
      expect(prisma.paymentInvoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-cancel-uuid' },
        data: { status: InvoiceStatus.CANCELLED }
      });
    });
  });
});
