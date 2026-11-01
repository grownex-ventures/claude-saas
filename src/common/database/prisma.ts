import { PrismaClient } from '@prisma/client';

const dbUrl = process.env.DATABASE_URL || '';
if (process.env.NODE_ENV === 'production') {
  const hasConnectionLimit = dbUrl.includes('connection_limit=');
  const hasPoolTimeout = dbUrl.includes('pool_timeout=');

  if (!hasConnectionLimit || !hasPoolTimeout) {
    console.warn(
      '\x1b[33m[Prisma Performance Warning] DATABASE_URL in production is missing recommended connection pooling parameters: connection_limit=20&pool_timeout=10. Please update your environment configuration.\x1b[0m'
    );
  }
}

export const prisma = new PrismaClient();
