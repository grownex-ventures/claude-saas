import express, { Express } from 'express';
import type { Server } from 'http';
import path from 'path';
import { tenantsController } from './tenants/tenants.controller.js';
import { authController } from './auth/auth.controller.js';
import { BotManagerService } from './bot-engine/bot-manager.service.js';
import { prisma } from './common/database/prisma.js';
import { redis } from './common/redis/redis.js';

import compression from 'compression';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';

export const app: Express = express();
const port = process.env.PORT || 3000;

// Security: Disable X-Powered-By
app.disable('x-powered-by');

// Security: Helmet headers with tailored Content-Security-Policy
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// Rate Limiters
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
  skip: () => process.env.NODE_ENV === 'test',
});

app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Separate page slugs for UI
app.get('/login', (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'login.html'));
});

app.get('/signup', (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'signup.html'));
});

app.get('/dashboard', (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'dashboard.html'));
});

// Liveness / health endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Authentication API endpoints with rate limiting
app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/auth', authController.router);

// Tenants API endpoints
app.use('/api/tenants', tenantsController.router);

export async function bootstrap(): Promise<{ app: Express; server: Server; botManager: BotManagerService }> {
  const botManager = new BotManagerService();

  // Initialize all active tenant bots
  try {
    console.log('[Server] Initializing active tenant bots...');
    await botManager.onModuleInit();
  } catch (err) {
    console.error('[Server] Failed to initialize tenant bots on startup:', err);
  }

  const server = app.listen(port, () => {
    console.log(`[Server] Cloud-SaaS running on port ${port}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[Server] Received ${signal}. Starting graceful shutdown...`);
    server.close(async () => {
      try {
        await botManager.onModuleDestroy();
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

  return { app, server, botManager };
}

// Auto-run if executed directly
if (process.env.NODE_ENV !== 'test') {
  bootstrap().catch((err) => {
    console.error('[Server] Fatal bootstrap error:', err);
    process.exit(1);
  });
}
