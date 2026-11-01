import { prisma } from '../database/prisma.js';

export interface AuditRecordInput {
  tenantId: string;
  action: string;
  actorIp: string;
  userAgent?: string | null;
  metadata?: Record<string, any> | null;
}

/**
 * Sanitizes metadata to ensure secrets or full API keys are never stored in audit logs.
 */
function sanitizeMetadata(metadata?: Record<string, any> | null): Record<string, any> | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;

  const sanitized: Record<string, any> = {};
  const secretKeywords = ['password', 'key', 'token', 'secret', 'hash', 'credential'];

  for (const [k, v] of Object.entries(metadata)) {
    const isSensitive = secretKeywords.some((keyword) => k.toLowerCase().includes(keyword));
    if (isSensitive) {
      if (typeof v === 'string') {
        // Redact full value, keep last 4 chars if long enough
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
 * Enterprise Audit Log Service (COMP-01)
 * Append-only compliance log.
 * The record() method catches all internal errors and NEVER throws into the request path.
 */
export class AuditLogService {
  /**
   * Appends an audit entry. Never throws to prevent disruption of user flows.
   */
  static async record(input: AuditRecordInput): Promise<void> {
    try {
      const sanitizedMeta = sanitizeMetadata(input.metadata);

      await prisma.auditLog.create({
        data: {
          tenantId: input.tenantId,
          action: input.action,
          actorIp: input.actorIp || 'unknown',
          userAgent: input.userAgent || null,
          metadata: sanitizedMeta ?? undefined
        }
      });
    } catch (err: any) {
      console.error(`[AuditLogService] Failed to record audit log for tenant ${input.tenantId} (${input.action}):`, err);
    }
  }
}

export const auditLogService = AuditLogService;
