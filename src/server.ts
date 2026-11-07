import './common/env.js';
import express, { Express } from 'express';
import type { Server } from 'http';
import path from 'path';
import fs from 'fs';
import yaml from 'yaml';
import swaggerUi from 'swagger-ui-express';
import { tenantsController } from './tenants/tenants.controller.js';
import { widgetController } from './widget/widget.controller.js';
import { authController } from './auth/auth.controller.js';
import { adminController } from './admin/admin.controller.js';
import { billingController } from './billing/billing.controller.js';
import { leadsRouter } from './leads/leads.router.js';
import { BotManagerService } from './bot-engine/bot-manager.service.js';
import { WhatsAppBotManagerService } from './whatsapp-engine/whatsapp-bot-manager.service.js';
import { prisma } from './common/database/prisma.js';
import { redis } from './common/redis/redis.js';
import { RetentionCleanerService } from './common/jobs/retention-cleaner.js';

import compression from 'compression';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';

export const app: Express = express();
const port = process.env.PORT || 3000;

// Security & Proxy: Trust reverse proxy (Cloudflare/Nginx/Caddy) for accurate req.ip
app.set('trust proxy', 1);

// Security: Disable X-Powered-By
app.disable('x-powered-by');

// Security: Helmet headers with tailored Content-Security-Policy & Cross-Origin support for embeddable widget
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com/gsi/client", "https://static.cloudflareinsights.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://accounts.google.com/gsi/style"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", 'data:', 'https:'],
        frameSrc: ["'self'", "https://accounts.google.com/gsi/"],
        connectSrc: ["'self'", "https://accounts.google.com/gsi/", "https://cloudflareinsights.com", "https://static.cloudflareinsights.com"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);

// Standard rate limit handler helper (API-03)
function createRateLimitHandler(message: string) {
  return (_req: express.Request, res: express.Response) => {
    res.status(429).json({
      error: message,
      code: 'RATE_LIMIT_EXCEEDED'
    });
  };
}

// Startup guard and skip evaluator for authentication rate limiter (Item 3)
export function shouldSkipAuthLimiter(): boolean {
  if (process.env.NODE_ENV === 'production') {
    if (process.env.E2E_DISABLE_AUTH_LIMIT === '1') {
      throw new Error('E2E_DISABLE_AUTH_LIMIT is strictly prohibited in production mode');
    }
    return false;
  }
  return process.env.NODE_ENV === 'test' || process.env.E2E_DISABLE_AUTH_LIMIT === '1';
}

// Enforce startup guard immediately on server load
shouldSkipAuthLimiter();

// Rate Limiters
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many requests across API, please slow down.'),
  skip: () => process.env.NODE_ENV === 'test' || (process.env.NODE_ENV !== 'production' && process.env.E2E_DISABLE_AUTH_LIMIT === '1'),
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many authentication attempts, please try again later.'),
  skip: () => shouldSkipAuthLimiter(),
});

app.use(compression());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Subdomain-aware root handler: app.yoursmmagent.com -> /login, yoursmmagent.com -> landing page
const landingDist = path.join(process.cwd(), 'landing', 'dist');

app.get('/', (req, res) => {
  const host = (req.headers.host || '').toLowerCase();
  if (host.startsWith('app.') || host.includes('app.yoursmmagent.com')) {
    if (req.cookies && req.cookies.auth_token) {
      return res.redirect('/dashboard');
    }
    return res.redirect('/login');
  }

  if (fs.existsSync(landingDist)) {
    return res.sendFile(path.join(landingDist, 'index.html'));
  }
  return res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

if (fs.existsSync(landingDist)) {
  app.use(express.static(landingDist));
}

// Serve public static assets (disabling automatic index.html)
app.use(express.static('public', { index: false }));

// Separate page slugs for UI (served from modern React SPA if built, otherwise legacy public)
app.get('/login', (_req, res) => {
  if (fs.existsSync(landingDist)) {
    return res.sendFile(path.join(landingDist, 'index.html'));
  }
  res.sendFile(path.join(process.cwd(), 'public', 'login.html'));
});

app.get('/signup', (_req, res) => {
  if (fs.existsSync(landingDist)) {
    return res.sendFile(path.join(landingDist, 'index.html'));
  }
  res.sendFile(path.join(process.cwd(), 'public', 'signup.html'));
});

// Modern React User Dashboard SPA (served from landing/dist)
app.get(['/dashboard', '/dashboard/*'], (_req, res) => {
  if (fs.existsSync(landingDist)) {
    return res.sendFile(path.join(landingDist, 'index.html'));
  }
  const oldDash = path.join(process.cwd(), 'public', 'dashboard.html');
  if (fs.existsSync(oldDash)) {
    return res.sendFile(oldDash);
  }
  return res.redirect('/login');
});

// Redirect legacy /app requests straight to /dashboard
app.get(['/app', '/app/*'], (_req, res) => {
  return res.redirect('/dashboard');
});

app.get('/reset-password', (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'reset-password.html'));
});

app.get('/verify-email', (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'verify-email.html'));
});

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'admin.html'));
});

// Deep Health Check endpoint (checks Postgres and Redis connections)
app.get('/health', async (_req, res) => {
  let dbStatus = 'healthy';
  let redisStatus = 'healthy';
  let isHealthy = true;

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (_err) {
    dbStatus = 'unhealthy';
    isHealthy = false;
  }

  try {
    const pong = await redis.ping();
    if (pong !== 'PONG') {
      redisStatus = 'unhealthy';
      isHealthy = false;
    }
  } catch (_err) {
    redisStatus = 'unhealthy';
    isHealthy = false;
  }

  const statusCode = isHealthy ? 200 : 503;
  res.status(statusCode).json({
    status: isHealthy ? 'ok' : 'degraded',
    database: dbStatus,
    redis: redisStatus,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Swagger UI OpenAPI 3.1 Documentation (API-01)
// Enabled by default; can be disabled in production via SWAGGER_ENABLED=false
if (process.env.SWAGGER_ENABLED !== 'false') {
  try {
    const openapiPath = path.join(process.cwd(), 'openapi.yaml');
    if (fs.existsSync(openapiPath)) {
      const openapiContent = fs.readFileSync(openapiPath, 'utf8');
      const openapiDoc = yaml.parse(openapiContent);
      app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiDoc));
      app.get('/api-docs.json', (_req, res) => res.json(openapiDoc));
    }
  } catch (err) {
    console.warn('[Server] Could not initialize Swagger UI at /api-docs:', err);
  }
}

// ---------------------------------------------------------------------
// Versioned API Routes: /api/v1/... (API-02)
// ---------------------------------------------------------------------
app.use('/api/v1', apiLimiter);
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/signup', authLimiter);
app.use('/api/v1/auth/google', authLimiter);
app.use('/api/v1/auth/mfa/verify-login', authLimiter);
app.use('/api/v1/auth/resend-verification', authLimiter);
app.use('/api/v1/auth/forgot-password', authLimiter);
app.use('/api/v1/auth', authController.router);
app.use('/api/v1/tenants', tenantsController.router);
app.use('/api/v1/widget', widgetController.router);
app.use('/api/v1/leads', leadsRouter);
app.use('/api/v1/admin', adminController.router);
app.use('/api/v1/billing', billingController.router);
app.post('/api/v1/telegram/webhook/:tenantId', async (req, res) => {
  const tenantId = req.params.tenantId;
  const secretHeader = req.headers['x-telegram-bot-api-secret-token'] as string;
  const botManager = BotManagerService.getInstance();
  const result = await botManager.handleWebhookUpdate(tenantId, secretHeader, req.body);
  if (!result.success) {
    res.status(403).json({ error: result.error || 'Webhook verification failed' });
    return;
  }
  res.status(200).json({ ok: true });
});

// ---------------------------------------------------------------------
// Backward-Compatible Unversioned Aliases: /api/... (API-02)
// Ensures existing embedded widget.js and dashboard callers never break
// ---------------------------------------------------------------------
app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/auth/google', authLimiter);
app.use('/api/auth/mfa/verify-login', authLimiter);
app.use('/api/auth/resend-verification', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth', authController.router);
app.use('/api/tenants', tenantsController.router);
app.use('/api/widget', widgetController.router);
app.use('/api/leads', leadsRouter);
app.use('/api/admin', adminController.router);
app.use('/api/billing', billingController.router);
app.post('/api/telegram/webhook/:tenantId', async (req, res) => {
  const tenantId = req.params.tenantId;
  const secretHeader = req.headers['x-telegram-bot-api-secret-token'] as string;
  const botManager = BotManagerService.getInstance();
  const result = await botManager.handleWebhookUpdate(tenantId, secretHeader, req.body);
  if (!result.success) {
    res.status(403).json({ error: result.error || 'Webhook verification failed' });
    return;
  }
  res.status(200).json({ ok: true });
});

export async function bootstrap(): Promise<{
  app: Express;
  server: Server;
  botManager: BotManagerService;
  whatsAppBotManager: WhatsAppBotManagerService;
}> {
  const botManager = BotManagerService.getInstance();
  const whatsAppBotManager = WhatsAppBotManagerService.getInstance();

  // Initialize all active tenant Telegram and WhatsApp bots
  try {
    console.log('[Server] Initializing active tenant Telegram and WhatsApp bots...');
    await botManager.onModuleInit();
    await whatsAppBotManager.onModuleInit();
    RetentionCleanerService.startDailyRetentionJob();
  } catch (err) {
    console.error('[Server] Failed to initialize tenant bots on startup:', err);
  }

  const server = app.listen(port, () => {
    console.log(`[Server] Cloud-SaaS running on port ${port}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[Server] Received ${signal}. Starting graceful shutdown...`);

    // Hard kill timer to prevent container/process hang during graceful shutdown
    const forceExitTimeout = setTimeout(() => {
      console.error('[Server] Graceful shutdown timed out after 10s. Forcing exit.');
      process.exit(1);
    }, 10000);
    forceExitTimeout.unref();

    server.close(async () => {
      try {
        await botManager.onModuleDestroy();
        await whatsAppBotManager.onModuleDestroy();
        await prisma.$disconnect();
        if (redis.status === 'ready' || redis.status === 'connect') {
          await redis.quit();
        } else {
          redis.disconnect();
        }
      } catch (err) {
        console.error('[Server] Error during shutdown:', err);
      } finally {
        process.exit(0);
      }
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return { app, server, botManager, whatsAppBotManager };
}

// Auto-run if executed directly
if (process.env.NODE_ENV !== 'test') {
  bootstrap().catch((err) => {
    console.error('[Server] Fatal bootstrap error:', err);
    process.exit(1);
  });
}
