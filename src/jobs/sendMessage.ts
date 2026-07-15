/**
 * sendMessage.ts  — BullMQ workers
 *
 * Anti-ban rules (enforced here):
 *  1. Never use Promise.all() for sends — messages are sent serially.
 *  2. A random 4–12 second delay is inserted between every outgoing message
 *     for the same user, mimicking human typing cadence.
 *  3. Daily quota is checked before every send; if exhausted the job is
 *     not retried (quota error is treated as a terminal failure).
 */

import { Worker, Job } from 'bullmq';
import prisma from '../db/prisma.js';
import { sendMessage, sendText, checkAndIncrementQuota } from '../services/whatsapp.js';
import { SCHEDULE_QUEUE, BROADCAST_QUEUE, scheduleJob } from '../services/scheduler.js';

const redisConnection = {
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Random integer between min and max (inclusive), in milliseconds. */
function randomDelayMs(minSec = 4, maxSec = 12): number {
  return (minSec + Math.random() * (maxSec - minSec)) * 1000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Per-user send locks: prevents two jobs for the same user from firing
// concurrently within the same worker process.
const userSendLocks = new Map<string, Promise<void>>();

/**
 * Enqueue a send operation for a user so it waits for any already-in-flight
 * send to finish, then waits the human-like delay before actually sending.
 */
async function serialisedSend(userId: string, fn: () => Promise<void>): Promise<void> {
  const previous = userSendLocks.get(userId) ?? Promise.resolve();

  const current = previous.then(async () => {
    // Wait 4–12 seconds to mimic human typing speed
    await sleep(randomDelayMs());
    await fn();
  });

  userSendLocks.set(userId, current.catch(() => {})); // don't let errors block future sends
  await current;
}

// ─── Schedule Worker ──────────────────────────────────────────────────────────

new Worker(
  SCHEDULE_QUEUE,
  async (job: Job) => {
    const { scheduleId } = job.data as { scheduleId: string };

    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: { user: true },
    });

    if (!schedule || schedule.status !== 'pending') return;

    const userId = schedule.userId;

    // ── Quota check ──────────────────────────────────────────────────────────
    const allowed = await checkAndIncrementQuota(userId);
    if (!allowed) {
      console.warn(`[Worker] Quota exhausted for user ${userId}, skipping schedule ${scheduleId}`);

      await prisma.schedule.update({
        where: { id: scheduleId },
        data: { status: 'failed' },
      });

      // Notify the user — use serialisedSend so even this notification is throttled
      await serialisedSend(userId, () =>
        sendText(
          userId,
          schedule.user.phone,
          `⚠️ Your daily message quota (${process.env.DAILY_MESSAGE_QUOTA ?? 50}) has been reached. Schedule ID ${scheduleId.slice(0, 8)} was not sent.`
        )
      );

      return; // do NOT throw — quota exhaustion is terminal, not retryable
    }

    // ── Send ─────────────────────────────────────────────────────────────────
    try {
      await serialisedSend(userId, () =>
        sendMessage({
          userId,
          to: schedule.recipient,
          textContent: schedule.textContent,
          mediaUrl: schedule.mediaUrl,
          mediaType: schedule.mediaType,
        })
      );

      await prisma.schedule.update({
        where: { id: scheduleId },
        data: { status: 'sent' },
      });

      // Notify the sender
      await serialisedSend(userId, () =>
        sendText(
          userId,
          schedule.user.phone,
          `✅ Your scheduled message to ${schedule.recipient} has been sent!`
        )
      );

      // ── Handle recurrence — re-queue the next occurrence ──────────────────
      if (schedule.recurrence) {
        const nextSendAt = getNextOccurrence(schedule.sendAt, schedule.recurrence);
        if (nextSendAt) {
          const newSchedule = await prisma.schedule.create({
            data: {
              userId: schedule.userId,
              recipient: schedule.recipient,
              textContent: schedule.textContent,
              mediaUrl: schedule.mediaUrl,
              mediaType: schedule.mediaType,
              sendAt: nextSendAt,
              recurrence: schedule.recurrence,
              status: 'pending',
            },
          });
          await scheduleJob(newSchedule.id, nextSendAt);
        }
      }
    } catch (err) {
      console.error(`[Worker] Failed to send schedule ${scheduleId}:`, err);

      await prisma.schedule.update({
        where: { id: scheduleId },
        data: { status: 'failed' },
      });

      // Notify sender of failure
      await serialisedSend(userId, () =>
        sendText(
          userId,
          schedule.user.phone,
          `❌ Failed to send your scheduled message to ${schedule.recipient} (ID: ${scheduleId.slice(0, 8)}). Reply RETRY ${scheduleId.slice(0, 8)} to try again.`
        )
      );

      throw err; // Let BullMQ handle retries
    }
  },
  { connection: redisConnection, concurrency: 10 }
);

// ─── Broadcast Worker ─────────────────────────────────────────────────────────

new Worker(
  BROADCAST_QUEUE,
  async (job: Job) => {
    const { broadcastId, recipient } = job.data as {
      broadcastId: string;
      recipient: string;
    };

    const broadcast = await prisma.broadcast.findUnique({
      where: { id: broadcastId },
      include: { user: true },
    });

    if (!broadcast || broadcast.status === 'cancelled') return;

    const userId = broadcast.userId;

    // ── Quota check ──────────────────────────────────────────────────────────
    const allowed = await checkAndIncrementQuota(userId);
    if (!allowed) {
      console.warn(
        `[Worker] Quota exhausted for user ${userId}, skipping broadcast ${broadcastId} → ${recipient}`
      );
      return; // terminal — do not retry
    }

    // ── Send (serialised per user) ────────────────────────────────────────────
    try {
      await serialisedSend(userId, () =>
        sendMessage({
          userId,
          to: recipient,
          textContent: broadcast.textContent,
          mediaUrl: broadcast.mediaUrl,
          mediaType: broadcast.mediaType,
        })
      );
    } catch (err) {
      console.error(`[Worker] Failed to send broadcast ${broadcastId} to ${recipient}:`, err);
      throw err;
    }
  },
  { connection: redisConnection, concurrency: 10 }
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getNextOccurrence(lastSendAt: Date, recurrence: string): Date | null {
  const next = new Date(lastSendAt);

  switch (recurrence) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      return next;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      return next;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      return next;
    default:
      return null;
  }
}

console.log('[Workers] Schedule and Broadcast workers started');
