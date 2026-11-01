import crypto from 'crypto';
import { redis } from '../redis/redis.js';
import { prisma } from '../database/prisma.js';

export type LogChannel = 'telegram' | 'whatsapp' | 'widget' | 'system';
export type LogLevel = 'info' | 'success' | 'warn' | 'error';

export interface RuntimeLogInput {
  tenantId: string;
  channel: LogChannel;
  level?: LogLevel;
  event: string;
  message: string;
  details?: Record<string, any> | null;
}

export interface RuntimeLogItem {
  id: string;
  tenantId: string;
  channel: LogChannel;
  level: LogLevel;
  event: string;
  message: string;
  details?: Record<string, any>;
  timestamp: string;
}

export interface LogQueryOptions {
  channel?: string;
  level?: string;
  search?: string;
  limit?: number;
}

function sanitizeDetails(details?: Record<string, any> | null): Record<string, any> | undefined {
  if (!details || typeof details !== 'object') return undefined;

  const sanitized: Record<string, any> = {};
  const secretKeywords = ['password', 'key', 'token', 'secret', 'hash', 'credential'];

  for (const [k, v] of Object.entries(details)) {
    const isSensitive = secretKeywords.some((kw) => k.toLowerCase().includes(kw));
    if (isSensitive) {
      if (typeof v === 'string') {
        sanitized[k] = v.length > 8 ? `***...${v.slice(-4)}` : '***REDACTED***';
      } else {
        sanitized[k] = '***REDACTED***';
      }
    } else {
      sanitized[k] = v;
    }
  }

  return sanitized;
}

/**
 * Enterprise Multi-Tenant Runtime Log Service
 * Stores fast high-throughput live channel telemetry in a capped Redis ring buffer
 * (tenant:${tenantId}:runtime_logs) with graceful fallback to persistent AuditLog records.
 */
export class RuntimeLogService {
  private static MAX_ENTRIES = 500;
  private static TTL_SECONDS = 604800; // 7 days

  /**
   * Records a live runtime telemetry event.
   * Completely non-blocking and safe for high-frequency message paths.
   */
  static async record(input: RuntimeLogInput): Promise<void> {
    if (!input || !input.tenantId) return;

    try {
      const logItem: RuntimeLogItem = {
        id: crypto.randomUUID(),
        tenantId: input.tenantId,
        channel: input.channel || 'system',
        level: input.level || 'info',
        event: input.event,
        message: input.message,
        details: sanitizeDetails(input.details),
        timestamp: new Date().toISOString()
      };

      const key = `tenant:${input.tenantId}:runtime_logs`;
      const serialized = JSON.stringify(logItem);

      const pipeline = redis.pipeline();
      pipeline.lpush(key, serialized);
      pipeline.ltrim(key, 0, this.MAX_ENTRIES - 1);
      pipeline.expire(key, this.TTL_SECONDS);
      await pipeline.exec();
    } catch (err: any) {
      // Non-blocking catch to prevent disruptions in hot execution paths
      console.warn(`[RuntimeLogService] Failed to buffer runtime log for tenant ${input.tenantId}:`, err?.message || err);
    }
  }

  /**
   * Fetches recent runtime logs for a tenant with optional channel/level/search filtering.
   */
  static async getLogs(
    tenantId: string,
    options: LogQueryOptions = {}
  ): Promise<{ logs: RuntimeLogItem[]; total: number }> {
    if (!tenantId) return { logs: [], total: 0 };

    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);
    const channelFilter = options.channel && options.channel !== 'all' ? options.channel.toLowerCase() : null;
    const levelFilter = options.level && options.level !== 'all' ? options.level.toLowerCase() : null;
    const searchFilter = options.search ? options.search.trim().toLowerCase() : null;

    let items: RuntimeLogItem[] = [];

    // 1. Fetch live ring buffer from Redis
    try {
      const key = `tenant:${tenantId}:runtime_logs`;
      const rawEntries = await redis.lrange(key, 0, 199);
      if (rawEntries && rawEntries.length > 0) {
        items = rawEntries
          .map((raw) => {
            try {
              return JSON.parse(raw) as RuntimeLogItem;
            } catch {
              return null;
            }
          })
          .filter((item): item is RuntimeLogItem => item !== null);
      }
    } catch (err) {
      console.warn(`[RuntimeLogService] Redis read failed for tenant ${tenantId}, falling back:`, err);
    }

    // 2. If Redis buffer has few items, merge persistent AuditLog records for complete history
    if (items.length < 20) {
      try {
        const auditEntries = await prisma.auditLog.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          take: 30
        });

        const auditItems: RuntimeLogItem[] = auditEntries.map((a) => ({
          id: a.id,
          tenantId: a.tenantId,
          channel: 'system',
          level: a.action.includes('ERROR') || a.action.includes('FAILED') ? 'error' : 'info',
          event: a.action,
          message: `Admin audit event: ${a.action.replace(/_/g, ' ')} from ${a.actorIp}`,
          details: (a.metadata as Record<string, any>) || undefined,
          timestamp: a.createdAt.toISOString()
        }));

        // Merge and deduplicate by ID
        const existingIds = new Set(items.map((i) => i.id));
        for (const entry of auditItems) {
          if (!existingIds.has(entry.id)) {
            items.push(entry);
          }
        }
        items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      } catch (err) {
        // Non-blocking fallback error
      }
    }

    // 3. Apply in-memory filtering
    let filtered = items;
    if (channelFilter) {
      filtered = filtered.filter((i) => i.channel.toLowerCase() === channelFilter);
    }
    if (levelFilter) {
      filtered = filtered.filter((i) => i.level.toLowerCase() === levelFilter);
    }
    if (searchFilter) {
      filtered = filtered.filter(
        (i) =>
          i.message.toLowerCase().includes(searchFilter) ||
          i.event.toLowerCase().includes(searchFilter) ||
          (i.details && JSON.stringify(i.details).toLowerCase().includes(searchFilter))
      );
    }

    return {
      logs: filtered.slice(0, limit),
      total: filtered.length
    };
  }

  /**
   * Flushes runtime logs for a tenant.
   */
  static async clearLogs(tenantId: string): Promise<void> {
    if (!tenantId) return;
    try {
      const key = `tenant:${tenantId}:runtime_logs`;
      await redis.del(key);
    } catch (err) {
      console.warn(`[RuntimeLogService] Failed to clear logs for tenant ${tenantId}:`, err);
    }
  }
}
