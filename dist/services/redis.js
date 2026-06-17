import { Redis } from 'ioredis';
// Shared Redis client used by both the buffer and BullMQ
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
});
redis.on('error', (err) => {
    console.error('[Redis] Connection error:', err);
});
redis.on('connect', () => {
    console.log('[Redis] Connected');
});
export default redis;
//# sourceMappingURL=redis.js.map