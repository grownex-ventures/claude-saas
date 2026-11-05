import crypto from 'crypto';
import { prisma } from '../common/database/prisma.js';
import { redis } from '../common/redis/redis.js';
import { validateSafeUrl, validateSafeUrlWithDispatcher } from '../common/security/url-validator.js';
import { fetch as undiciFetch } from 'undici';
import { AiAgentService } from '../ai-engine/ai-agent.service.js';

export class PanelCrawlerService {
  /**
   * Crawls the SMM panel for active services and caches them in Postgres & Redis.
   * Standard SMM panels (like PerfectPanel) expose an 'action=services' endpoint.
   */
  static async crawlAndCachePanel(tenantId: string, panelApiUrl: string, adminApiKey?: string) {
    try {
      const { safeUrl, dispatcher } = await validateSafeUrlWithDispatcher(panelApiUrl);

      const body = new URLSearchParams();
      body.append('action', 'services');

      // Some panels require an API key even for fetching the services list
      if (adminApiKey) {
        body.append('key', adminApiKey);
      }

      const isMocked = typeof (globalThis.fetch as any)?.mock !== 'undefined';
      const response = isMocked
        ? await fetch(safeUrl, {
            method: 'POST',
            body: body,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
          })
        : await undiciFetch(safeUrl, {
            method: 'POST',
            body: body.toString(),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            dispatcher,
            redirect: 'error'
          });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const servicesData = await response.json();

      // 1. Persist the raw catalog to PostgreSQL for analytics and LLM context
      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          crawledData: servicesData as any,
          lastCrawledAt: new Date()
        }
      });

      // 2. Cache in Redis for lightning-fast lookups by the bot (300s TTL)
      await redis.setex(`tenant:${tenantId}:crawl:services`, 300, JSON.stringify(servicesData));

      return { success: true, count: Array.isArray(servicesData) ? servicesData.length : 0 };
    } catch (error: any) {
      console.error(`[PanelCrawlerService] Failed to crawl tenant ${tenantId}:`, error);
      return { success: false, error: error?.message || String(error) };
    }
  }

  /**
   * Retrieves a pre-generated AI reply for identical recurring user queries.
   */
  static async getCachedReply(tenantId: string, userText: string): Promise<string | null> {
    if (AiAgentService.isDynamicQuery(userText)) {
      return null;
    }
    const hash = crypto.createHash('sha256').update(userText.trim().toLowerCase()).digest('hex');
    try {
      const cached = await redis.get(`tenant:${tenantId}:qcache:${hash}`);
      return cached || null;
    } catch {
      return null;
    }
  }

  /**
   * Caches a successful AI generation to save token costs on repetitive questions.
   */
  static async setCachedReply(tenantId: string, userText: string, replyText: string): Promise<void> {
    if (AiAgentService.isDynamicQuery(userText)) {
      return;
    }
    const hash = crypto.createHash('sha256').update(userText.trim().toLowerCase()).digest('hex');
    try {
      await redis.setex(`tenant:${tenantId}:qcache:${hash}`, 300, replyText);
    } catch {
      // Non-blocking error
    }
  }

  // Instance wrappers for compatibility with existing service injections
  async crawlAndCachePanel(tenantId: string, panelApiUrl: string, adminApiKey?: string) {
    return PanelCrawlerService.crawlAndCachePanel(tenantId, panelApiUrl, adminApiKey);
  }

  async getCachedReply(tenantId: string, userText: string): Promise<string | null> {
    return PanelCrawlerService.getCachedReply(tenantId, userText);
  }

  async setCachedReply(tenantId: string, userText: string, replyText: string): Promise<void> {
    return PanelCrawlerService.setCachedReply(tenantId, userText, replyText);
  }
}
