import redis from './redis.js';
import { processMessage } from '../controllers/messageController.js';
const BUFFER_WINDOW_MS = 3000; // 3 seconds window to group text + media
const REDIS_KEY_TTL_SEC = 60; // 60 seconds safety TTL so the key persists until flushed
/**
 * Buffer an incoming message from a phone number.
 * If a text + media arrive within 3 seconds they are merged into one object.
 * After 3 seconds the buffer is flushed and passed to the message controller.
 */
export async function bufferMessage(phone, message) {
    const key = `buffer:${phone}`;
    const existing = await redis.get(key);
    const combined = existing ? JSON.parse(existing) : {};
    if (message.type === 'text' && message.text) {
        combined.text = message.text;
    }
    if (['image', 'video', 'audio', 'document', 'contact'].includes(message.type) &&
        message.mediaUrl) {
        combined.media = {
            url: message.mediaUrl,
            type: message.mediaType ?? message.type,
            caption: message.mediaCaption ?? null,
        };
    }
    // Store with a safe safety TTL (e.g., 60 seconds) so it survives until the flush
    await redis.set(key, JSON.stringify(combined), 'EX', REDIS_KEY_TTL_SEC);
    // Only schedule the flush on the first message in this window
    if (!existing) {
        setTimeout(() => flushBuffer(phone), BUFFER_WINDOW_MS);
    }
}
/**
 * Flush the buffer for a phone number and pass the combined message to the controller.
 */
async function flushBuffer(phone) {
    const key = `buffer:${phone}`;
    const raw = await redis.get(key);
    if (!raw)
        return;
    await redis.del(key);
    const combined = JSON.parse(raw);
    await processMessage(phone, combined);
}
//# sourceMappingURL=buffer.js.map