import { Worker } from 'bullmq';
import prisma from '../db/prisma.js';
import { sendMessage, sendText } from '../services/whatsapp.js';
import { SCHEDULE_QUEUE, BROADCAST_QUEUE, scheduleJob } from '../services/scheduler.js';
// BullMQ bundles its own ioredis — use a plain connection config object
const redisConnection = {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
};
// ─── Schedule Worker ──────────────────────────────────────────────────────────
new Worker(SCHEDULE_QUEUE, async (job) => {
    const { scheduleId } = job.data;
    const schedule = await prisma.schedule.findUnique({
        where: { id: scheduleId },
        include: { user: true },
    });
    if (!schedule || schedule.status !== 'pending')
        return;
    try {
        await sendMessage({
            to: schedule.recipient,
            textContent: schedule.textContent,
            mediaUrl: schedule.mediaUrl,
            mediaType: schedule.mediaType,
        });
        await prisma.schedule.update({
            where: { id: scheduleId },
            data: { status: 'sent' },
        });
        // Notify the sender
        await sendText(schedule.user.phone, `✅ Your scheduled message to ${schedule.recipient} has been sent!`);
        // Handle recurrence — re-queue the next occurrence
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
    }
    catch (err) {
        console.error(`[Worker] Failed to send schedule ${scheduleId}:`, err);
        await prisma.schedule.update({
            where: { id: scheduleId },
            data: { status: 'failed' },
        });
        // Notify sender of failure
        await sendText(schedule.user.phone, `❌ Failed to send your scheduled message to ${schedule.recipient} (ID: ${scheduleId.slice(0, 8)}). Reply RETRY ${scheduleId.slice(0, 8)} to try again.`);
        throw err; // Let BullMQ handle retries
    }
}, { connection: redisConnection });
// ─── Broadcast Worker ─────────────────────────────────────────────────────────
new Worker(BROADCAST_QUEUE, async (job) => {
    const { broadcastId, recipient } = job.data;
    const broadcast = await prisma.broadcast.findUnique({
        where: { id: broadcastId },
        include: { user: true },
    });
    if (!broadcast || broadcast.status === 'cancelled')
        return;
    try {
        await sendMessage({
            to: recipient,
            textContent: broadcast.textContent,
            mediaUrl: broadcast.mediaUrl,
            mediaType: broadcast.mediaType,
        });
    }
    catch (err) {
        console.error(`[Worker] Failed to send broadcast ${broadcastId} to ${recipient}:`, err);
        throw err;
    }
}, { connection: redisConnection });
// ─── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Calculate the next occurrence date based on recurrence type.
 */
function getNextOccurrence(lastSendAt, recurrence) {
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
            // custom recurrences are not auto-rescheduled here
            return null;
    }
}
console.log('[Workers] Schedule and Broadcast workers started');
//# sourceMappingURL=sendMessage.js.map