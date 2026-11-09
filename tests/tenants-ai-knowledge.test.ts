import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/common/database/prisma.js';
import { authService } from '../src/auth/auth.service.js';
import { TenantsService } from '../src/tenants/tenants.service.js';
import { AiAgentService } from '../src/ai-engine/ai-agent.service.js';

describe('Tenants AI & Knowledge Base Service Suite', () => {
  let tenantId: string;
  const tenantsService = new TenantsService();

  beforeAll(async () => {
    const testEmail = `ai-test-${Date.now()}@example.com`;
    const signup = await authService.signup({
      email: testEmail,
      password: 'StrongPassword123!'
    });
    tenantId = signup.tenant!.id;
  });

  afterAll(async () => {
    if (tenantId) {
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
    }
  });

  it('getAiSettings returns default AI configuration and FAQs', async () => {
    const settings = await tenantsService.getAiSettings(tenantId);

    expect(settings).toBeDefined();
    expect(settings.tone).toBe('friendly');
    expect(settings.language).toBe('auto');
    expect(settings.hours).toBeDefined();
    expect(settings.hours.enabled).toBe(false);
    expect(settings.actions).toBeDefined();
    expect(settings.actions.balance).toBe(true);
    expect(Array.isArray(settings.faqs)).toBe(true);
    expect(settings.faqs.length).toBeGreaterThanOrEqual(1);
  });

  it('updateAiSettings rejects invalid business hours where start >= end', async () => {
    await expect(
      tenantsService.updateAiSettings(tenantId, {
        hours: {
          enabled: true,
          start: '21:00',
          end: '09:00',
          timezone: 'UTC'
        }
      })
    ).rejects.toThrow('Business hours: the end time must be after the start time');
  });

  it('updateAiSettings updates tone, language, and allowed actions in PostgreSQL', async () => {
    const updated = await tenantsService.updateAiSettings(tenantId, {
      tone: 'professional',
      language: 'es',
      actions: {
        balance: true,
        services: true,
        orderStatus: true,
        refill: false,
        cancel: false
      }
    });

    expect(updated.tone).toBe('professional');
    expect(updated.language).toBe('es');
    expect(updated.actions.refill).toBe(false);

    // Verify persisted in PostgreSQL
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { aiSettings: true }
    });
    expect((tenant?.aiSettings as any)?.tone).toBe('professional');
    expect((tenant?.aiSettings as any)?.language).toBe('es');
  });

  it('addFaq, updateFaq, and deleteFaq manage custom knowledge base', async () => {
    // 1. Add FAQ
    const newFaq = await tenantsService.addFaq(tenantId, {
      question: 'Do you offer a money-back guarantee?',
      answer: 'Yes! We refund any undelivered orders within 24 hours to your balance.'
    });

    expect(newFaq.id).toBeDefined();
    expect(newFaq.question).toBe('Do you offer a money-back guarantee?');
    expect(newFaq.answer).toBe('Yes! We refund any undelivered orders within 24 hours to your balance.');

    // Verify in settings
    let current = await tenantsService.getAiSettings(tenantId);
    expect(current.faqs.some((f: any) => f.id === newFaq.id)).toBe(true);

    // 2. Update FAQ
    const updatedFaq = await tenantsService.updateFaq(tenantId, newFaq.id, {
      question: 'Do you offer a money-back guarantee?',
      answer: 'Yes! 100% money back guarantee on all undelivered orders.'
    });

    expect(updatedFaq.answer).toBe('Yes! 100% money back guarantee on all undelivered orders.');

    // 3. Delete FAQ
    const deleteRes = await tenantsService.deleteFaq(tenantId, newFaq.id);
    expect(deleteRes.success).toBe(true);

    current = await tenantsService.getAiSettings(tenantId);
    expect(current.faqs.some((f: any) => f.id === newFaq.id)).toBe(false);
  });

  it('testAiAgent answers using custom tenant FAQ knowledge', async () => {
    const result = await tenantsService.testAiAgent(tenantId, {
      message: 'How long does delivery take?',
      settings: {
        tone: 'short',
        language: 'en',
        faqs: [
          {
            id: 'test_1',
            question: 'How long does delivery take?',
            answer: 'Delivery starts instantly within 5 minutes.'
          }
        ]
      }
    });

    expect(result.reply).toBeDefined();
    expect(typeof result.reply).toBe('string');
    expect(result.reply).toContain('Delivery starts instantly within 5 minutes.');
    expect(result.escalated).toBe(false);
  });

  it('testAiAgent detects escalation keywords properly', async () => {
    const result = await tenantsService.testAiAgent(tenantId, {
      message: 'This is a scam, I demand an immediate refund!',
      settings: {
        tone: 'professional',
        escalation: {
          onRequest: true,
          keywords: 'scam, chargeback, refund'
        }
      }
    });

    expect(result.reply).toBeDefined();
    expect(result.escalated).toBe(true);
  });
});
