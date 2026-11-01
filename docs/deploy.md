# Production Deployment Guide

## Database Connection Pooling (DB-03)
In high-throughput multi-tenant deployments, unconstrained PostgreSQL connection creation can exhaust database resources or cause connection starvation.

Always append `connection_limit=20&pool_timeout=10` to your `DATABASE_URL` in production environments:
```env
DATABASE_URL="postgresql://user:password@db-host:5432/cloud_saas?schema=public&connection_limit=20&pool_timeout=10"
```
- `connection_limit=20`: Bounds the Prisma client connection pool to at most 20 connections per server instance.
- `pool_timeout=10`: Aborts requests waiting more than 10 seconds for a pooled connection, preventing unbounded queueing and request starvation.
- The application automatically emits a startup warning if these pooling query parameters are missing in `NODE_ENV=production`.

## Chat Message Retention Policy (COMP-02)
- `CHAT_RETENTION_DAYS`: Controls the GDPR/compliance data retention period for visitor `WebChatMessage` records (defaults to 90 days).
- A daily automated purge runs with distributed Redis locking (`lock:retention_cleanup`), ensuring single-execution across horizontal multi-instance clusters.

## Environment Variables Reference
| Variable | Description | Default / Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/cloud_saas?schema=public&connection_limit=20&pool_timeout=10` |
| `REDIS_URL` | Redis server connection string | `redis://:password@host:6379` |
| `JWT_SECRET` | Secret key for signing tenant JWT tokens (min 32 chars) | Cryptographically secure random string |
| `ENCRYPTION_KEY` | AES-256-GCM hex key for tenant API keys & bot tokens (32 bytes) | 64-character hex string |
| `PORT` | HTTP server listening port | `3000` |
| `CHAT_RETENTION_DAYS` | Days to keep web chat logs before daily purge | `90` |
