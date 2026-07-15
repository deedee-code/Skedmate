/**
 * whatsapp.ts
 *
 * Thin wrapper around the Baileys socket for sending messages.
 * All outbound sends go through here so the rest of the codebase stays
 * decoupled from Baileys internals.
 *
 * Two send patterns:
 *
 *  1. sendText(userId, to, text)
 *     Used by scheduled/broadcast jobs — requires the sender's userId.
 *
 *  2. replyToUser(phone, text)
 *     Used by conversation handlers — the bot is the Skedmate bot number
 *     (BOT_USER_ID env var) replying to the user's own phone number.
 *     Falls back to sendText with the user's own session if BOT_USER_ID is
 *     not configured (single-tenant mode: the user IS the bot).
 *
 * Rules enforced here:
 *  - Format numbers to WhatsApp JIDs (number@s.whatsapp.net)
 *  - Look up the sender's active socket from the session manager
 *  - Never use Promise.all for sends (rule from whatsapp-rules.md)
 */

import { getSocket } from './sessionManager.js';
import prisma from '../db/prisma.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a plain E.164-ish number to a WhatsApp JID.
 * Strips all non-digits then appends @s.whatsapp.net.
 * Group JIDs (@g.us) are passed through unchanged.
 */
export function toJid(phone: string): string {
  if (phone.includes('@')) return phone; // already a JID
  const digits = phone.replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
}

// ─── Core send ────────────────────────────────────────────────────────────────

/**
 * Send a text message on behalf of a user.
 *
 * @param userId  - The internal User.id whose Baileys socket to use
 * @param to      - Recipient phone number (E.164) or JID
 * @param text    - Message body
 */
export async function sendText(
  userId: string,
  to: string,
  text: string
): Promise<void> {
  const sock = getSocket(userId);
  if (!sock) {
    throw new Error(`[whatsapp] No active session for user ${userId}`);
  }

  const jid = toJid(to);
  await sock.sendMessage(jid, { text });
}

/**
 * Send a media message (image, video, audio, document) with an optional caption.
 *
 * @param userId    - The internal User.id whose Baileys socket to use
 * @param to        - Recipient phone number or JID
 * @param mediaUrl  - Publicly accessible URL of the media file
 * @param mimeType  - MIME type, e.g. "image/jpeg", "video/mp4"
 * @param caption   - Optional caption text
 */
export async function sendMedia(
  userId: string,
  to: string,
  mediaUrl: string,
  mimeType: string,
  caption?: string | null
): Promise<void> {
  const sock = getSocket(userId);
  if (!sock) {
    throw new Error(`[whatsapp] No active session for user ${userId}`);
  }

  const jid = toJid(to);
  const url = { url: mediaUrl } as any; // Baileys accepts { url } for remote media

  if (mimeType.startsWith('image/')) {
    await sock.sendMessage(jid, { image: url, caption: caption ?? undefined });
  } else if (mimeType.startsWith('video/')) {
    await sock.sendMessage(jid, { video: url, caption: caption ?? undefined });
  } else if (mimeType.startsWith('audio/')) {
    await sock.sendMessage(jid, { audio: url, mimetype: mimeType });
  } else {
    // Generic document
    const filename = mediaUrl.split('/').pop() ?? 'file';
    await sock.sendMessage(jid, {
      document: url,
      mimetype: mimeType,
      fileName: filename,
      caption: caption ?? undefined,
    });
  }
}

/**
 * Unified send — handles text-only, media-only, or text+media.
 * This is the primary interface used by the job worker.
 *
 * @param userId      - The internal User.id
 * @param to          - Recipient phone number or JID
 * @param textContent - Optional text body
 * @param mediaUrl    - Optional media URL
 * @param mediaType   - Optional MIME type (required when mediaUrl is provided)
 */
export async function sendMessage(params: {
  userId: string;
  to: string;
  textContent?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
}): Promise<void> {
  const { userId, to, textContent, mediaUrl, mediaType } = params;

  if (mediaUrl && mediaType) {
    await sendMedia(userId, to, mediaUrl, mediaType, textContent);
  } else if (textContent) {
    await sendText(userId, to, textContent);
  }
}

// ─── Quota helpers ────────────────────────────────────────────────────────────

const DAILY_QUOTA = parseInt(process.env.DAILY_MESSAGE_QUOTA ?? '50', 10);

/**
 * Check whether a user has remaining daily quota.
 * Resets the counter automatically when a new UTC day begins.
 *
 * @returns true if the user may still send messages today
 */
export async function checkAndIncrementQuota(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return false;

  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const lastDate = user.dailyQuotaDate;
  const sameDay =
    lastDate !== null &&
    lastDate.getUTCFullYear() === todayUTC.getUTCFullYear() &&
    lastDate.getUTCMonth() === todayUTC.getUTCMonth() &&
    lastDate.getUTCDate() === todayUTC.getUTCDate();

  const currentCount = sameDay ? user.dailyMessageCount : 0;

  if (currentCount >= DAILY_QUOTA) {
    return false; // quota exhausted
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      dailyMessageCount: currentCount + 1,
      dailyQuotaDate: todayUTC,
    },
  });

  return true;
}

// ─── Bot reply helper ─────────────────────────────────────────────────────────

/**
 * Send a bot reply to a user during a conversation flow.
 *
 * In multi-tenant mode every user IS their own sender, so we look up
 * the user record by phone and use their own session to reply to themselves
 * (i.e., the bot sends from the user's linked number).
 *
 * This keeps all handler code simple — they just call:
 *   await replyToUser(phone, 'Hello!')
 * without needing to know userId.
 *
 * NOTE: quota is NOT consumed for bot replies — only for scheduled sends.
 */
export async function replyToUser(phone: string, text: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { phone } });

  if (!user) {
    // User not registered yet — can't reply without a session
    console.warn(`[whatsapp] replyToUser: no user found for phone ${phone}`);
    return;
  }

  const sock = getSocket(user.id);

  if (!sock) {
    // Session not active yet (e.g. still scanning QR) — log and skip
    console.warn(`[whatsapp] replyToUser: no active session for user ${user.id} (${phone})`);
    return;
  }

  const jid = toJid(phone);
  await sock.sendMessage(jid, { text });
}
