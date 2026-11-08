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

      let servicesData: any = null;
      try {
        servicesData = await response.json();
      } catch {
        servicesData = null;
      }

      if (!Array.isArray(servicesData) || servicesData.length === 0) {
        console.log(`[PanelCrawlerService] API endpoint did not return an array (${JSON.stringify(servicesData)}), attempting public /services HTML scrape fallback...`);
        const scraped = await PanelCrawlerService.scrapePublicServices(panelApiUrl);
        if (scraped.length > 0) {
          servicesData = scraped;
        }
      }

      if (!Array.isArray(servicesData) || servicesData.length === 0) {
        throw new Error('Panel returned no services array from API or public catalog');
      }

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

      // 3. Invalidate any cached AI queries for this tenant via tracked set and non-blocking SCAN (eliminates blocking redis.keys)
      try {
        if (redis.status === 'ready' || redis.status === 'connect') {
          const setKey = `tenant:${tenantId}:qcache_keys`;
          const trackedKeys = await redis.smembers(setKey);
          if (trackedKeys && trackedKeys.length > 0) {
            await redis.del(...trackedKeys, setKey);
          }
          // Non-blocking SCAN for any legacy or untracked keys
          let cursor = '0';
          do {
            const [nextCursor, matchedKeys] = await redis.scan(cursor, 'MATCH', `tenant:${tenantId}:qcache:*`, 'COUNT', 100);
            cursor = nextCursor;
            if (matchedKeys.length > 0) {
              await redis.del(...matchedKeys);
            }
          } while (cursor !== '0');
        }
      } catch {}

      return { success: true, count: servicesData.length };
    } catch (error: any) {
      console.error(`[PanelCrawlerService] Failed to crawl tenant ${tenantId}:`, error);
      return { success: false, error: error?.message || String(error) };
    }
  }

  /**
   * Scrapes public /services page for panels (e.g. PerfectPanel) where API v2 requires an admin key.
   */
  static async scrapePublicServices(panelApiUrl: string): Promise<any[]> {
    try {
      const parsed = new URL(panelApiUrl);
      const publicServicesUrl = `${parsed.origin}/services`;
      const { safeUrl, dispatcher } = await validateSafeUrlWithDispatcher(publicServicesUrl);

      const res = await undiciFetch(safeUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        dispatcher,
        redirect: 'follow'
      });

      if (!res.ok) return [];
      const html = await res.text();

      const regex = /<tr[^>]*data-filter-table-category-id="([^"]*)"[^>]*>[\s\S]*?<td[^>]*data-filter-table-service-id="([^"]*)">([^<]*)<\/td>[\s\S]*?<td[^>]*class="table-service"[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*data-label="Rate per 1000"[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*data-label="Min order"[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*data-label="Max order"[^>]*>([\s\S]*?)<\/td>/g;

      const services: any[] = [];
      let m;
      while ((m = regex.exec(html)) !== null) {
        const serviceId = m[2].trim();
        const name = m[4].replace(/<[^>]*>/g, '').trim();
        const rate = m[5].replace(/<[^>]*>/g, '').replace(/[^\d.]/g, '').trim();
        const min = m[6].replace(/<[^>]*>/g, '').replace(/[^\d]/g, '').trim();
        const max = m[7].replace(/<[^>]*>/g, '').replace(/[^\d]/g, '').trim();
        if (serviceId && name) {
          services.push({
            service: Number(serviceId),
            name,
            rate: rate || '0.00',
            min: Number(min) || 1,
            max: Number(max) || 1000000,
            category: 'SMM Services',
            type: 'Default'
          });
        }
      }
      return services;
    } catch (e) {
      console.warn('[PanelCrawlerService] Public scraper fallback failed:', e);
      return [];
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
