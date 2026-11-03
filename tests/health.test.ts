import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from '../src/server.js';
import { prisma } from '../src/common/database/prisma.js';
import { redis } from '../src/common/redis/redis.js';

describe('Deep Health Check (GET /health)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const getHealthHandler = () => {
    const layer = (app as any)._router.stack.find((l: any) => l.route && l.route.path === '/health');
    return layer.route.stack[0].handle;
  };

  it('returns 200 and healthy status when both database and redis are reachable', async () => {
    vi.spyOn(prisma, '$queryRaw').mockResolvedValueOnce([{ 1: 1 }] as any);
    vi.spyOn(redis, 'ping').mockResolvedValueOnce('PONG' as any);

    const handler = getHealthHandler();
    const req = {} as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as any;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        database: 'healthy',
        redis: 'healthy',
        uptime: expect.any(Number),
        timestamp: expect.any(String)
      })
    );
  });

  it('returns 503 and degraded status when database query fails', async () => {
    vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('Connection refused'));
    vi.spyOn(redis, 'ping').mockResolvedValueOnce('PONG' as any);

    const handler = getHealthHandler();
    const req = {} as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as any;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'degraded',
        database: 'unhealthy',
        redis: 'healthy'
      })
    );
  });

  it('returns 503 and degraded status when redis ping fails', async () => {
    vi.spyOn(prisma, '$queryRaw').mockResolvedValueOnce([{ 1: 1 }] as any);
    vi.spyOn(redis, 'ping').mockRejectedValueOnce(new Error('Redis timeout'));

    const handler = getHealthHandler();
    const req = {} as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as any;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'degraded',
        database: 'healthy',
        redis: 'unhealthy'
      })
    );
  });
});
