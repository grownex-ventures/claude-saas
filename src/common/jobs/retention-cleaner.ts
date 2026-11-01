import { prisma } from '../database/prisma.js';
import { redis } from '../redis/redis.js';

export class RetentionCleanerService {
  /**
   * Purges WebChatMessage records older than the configured retention period (default 90 days).
   * Safe for multi-instance deployments via a distributed Redis mutex lock.
   */
  static async purgeExpiredChatMessages(): Promise<{ purgedCount: number; skipped: boolean }> {
    const retentionDays = parseInt(process.env.CHAT_RETENTION_DAYS || '90', 10);
    const lockKey = 'lock:retention_cleanup';
    const lockTtlSeconds = 3600; // 1 hour lock prevents concurrent or rapid duplicate runs

    let lockAcquired = false;
    try {
      // SET NX EX ensures only one instance acquires the cleanup task
      const result = await redis.set(lockKey, '1', 'EX', lockTtlSeconds, 'NX');
      lockAcquired = result === 'OK';
    } catch (err) {
      console.warn('[RetentionCleaner] Failed to query Redis lock, running without distributed lock:', err);
      lockAcquired = true;
    }

    if (!lockAcquired) {
      return { purgedCount: 0, skipped: true };
    }

    try {
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      const deleteResult = await prisma.webChatMessage.deleteMany({
        where: {
          createdAt: {
            lt: cutoff
          }
        }
      });

      console.log(
        `[RetentionCleaner] Successfully purged ${deleteResult.count} WebChatMessage records older than ${retentionDays} days (cutoff: ${cutoff.toISOString()})`
      );

      return { purgedCount: deleteResult.count, skipped: false };
    } catch (err) {
      console.error('[RetentionCleaner] Error during retention cleanup execution:', err);
      return { purgedCount: 0, skipped: false };
    }
  }

  /**
   * Starts a daily recurring interval timer for chat message purging.
   */
  static startDailyRetentionJob(): NodeJS.Timeout | null {
    if (process.env.NODE_ENV === 'test') {
      return null;
    }

    // Run initial cleanup with a slight delay after startup
    setTimeout(() => {
      RetentionCleanerService.purgeExpiredChatMessages().catch(() => {});
    }, 10000);

    // Schedule every 24 hours
    const interval = setInterval(() => {
      RetentionCleanerService.purgeExpiredChatMessages().catch(() => {});
    }, 24 * 60 * 60 * 1000);

    return interval;
  }
}
