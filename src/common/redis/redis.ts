import { Redis } from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
export const redis = new Redis(redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false
});

// Suppress unhandled EventEmitter crash if Redis is unavailable or reconnecting
redis.on('error', (err) => {
  if (process.env.NODE_ENV !== 'test') {
    console.warn('[Redis] Connection warning:', err?.message || String(err));
  }
});
