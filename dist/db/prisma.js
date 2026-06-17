import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
// Prisma 7 requires a driver adapter for PostgreSQL
const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? '',
});
// Singleton pattern — reuse the same client across the app
const prisma = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});
export default prisma;
//# sourceMappingURL=prisma.js.map