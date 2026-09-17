import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Prisma 7 requires a driver adapter for PostgreSQL
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? '',
});

// Singleton pattern — reuse the same client across the app
// Allow overriding Prisma log levels with PRISMA_LOG env var.
// Examples:
//   PRISMA_LOG=none         -> disables Prisma logs
//   PRISMA_LOG=error,warn    -> only error and warn logs
// If not set, defaults to verbose in development and `error` in production.
const prismaLogEnv = process.env.PRISMA_LOG ?? '';
let logLevels: string[] = [];

if (prismaLogEnv.toLowerCase() === 'none') {
  logLevels = [];
} else if (prismaLogEnv) {
  logLevels = prismaLogEnv.split(',').map((s) => s.trim()).filter(Boolean);
} else {
  logLevels = process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'];
}

const prisma = new PrismaClient({
  adapter,
  log: logLevels as any,
});

export default prisma;
