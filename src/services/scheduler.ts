import { Queue } from 'bullmq';

// BullMQ bundles its own ioredis internally.
// Pass a connection config object (not a Redis instance) to avoid version conflicts.
const redisConnection = {
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
};

export const SCHEDULE_QUEUE = 'skedmate-schedule';
export const BROADCAST_QUEUE = 'skedmate-broadcast';

// Queue for individual scheduled messages
export const scheduleQueue = new Queue(SCHEDULE_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 200,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
});

// Queue for broadcast jobs (one job per recipient)
export const broadcastQueue = new Queue(BROADCAST_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 200,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
});

/**
 * Schedule a single message job.
 * @param scheduleId - The DB Schedule record ID
 * @param sendAt - When to send
 */
export async function scheduleJob(scheduleId: string, sendAt: Date): Promise<void> {
  const delay = Math.max(0, sendAt.getTime() - Date.now());
  await scheduleQueue.add('send', { scheduleId }, { delay, jobId: `schedule:${scheduleId}` });
}

/**
 * Schedule a broadcast job for a single recipient.
 * @param broadcastId - The DB Broadcast record ID
 * @param recipient - The recipient phone number
 * @param sendAt - When to send
 */
export async function scheduleBroadcastJob(
  broadcastId: string,
  recipient: string,
  sendAt: Date
): Promise<void> {
  const delay = Math.max(0, sendAt.getTime() - Date.now());
  const jobId = `broadcast:${broadcastId}:${recipient}`;
  await broadcastQueue.add('send', { broadcastId, recipient }, { delay, jobId });
}

/**
 * Cancel a scheduled job by its schedule ID.
 */
export async function cancelJob(scheduleId: string): Promise<boolean> {
  const job = await scheduleQueue.getJob(`schedule:${scheduleId}`);
  if (!job) return false;
  await job.remove();
  return true;
}
