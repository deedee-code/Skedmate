/**
 * sessionManager.ts
 *
 * Multi-tenant Baileys session manager.
 *
 * - One WASocket per user, kept alive in-process via a Map.
 * - Auto-reconnects on disconnect (unless the user explicitly logged out).
 * - Emits QR codes via a callback so callers can serve them however they like.
 * - Cleans up socket state cleanly on logout.
 */

import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  WASocket,
  BaileysEventMap,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { usePostgresAuthState, deleteAuthState } from './baileyAuthState.js';
import { sendText } from './whatsapp.js';
import prisma from '../db/prisma.js';

// ─── In-process socket registry ──────────────────────────────────────────────

interface SessionEntry {
  sock: WASocket;
  /** True while a connection attempt is in flight (prevents duplicate reconnects). */
  connecting: boolean;
}

const sessions = new Map<string, SessionEntry>();

// ─── Types ────────────────────────────────────────────────────────────────────

export type QRCallback = (qrDataURL: string) => void;
export type SessionEvent = 'open' | 'close' | 'qr';

// ─── Core connect function ────────────────────────────────────────────────────

/**
 * Connect (or reconnect) a user's WhatsApp session.
 *
 * @param userId    - Internal User.id (UUID)
 * @param onQR      - Called with a data-URL PNG whenever a new QR is ready
 * @param onOpen    - Called once the connection is fully authenticated
 */
export async function connectUser(
  userId: string,
  onQR?: QRCallback,
  onOpen?: () => void
): Promise<void> {
  // Don't open a second socket if one is already connecting/open
  const existing = sessions.get(userId);
  if (existing?.connecting) return;

  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await usePostgresAuthState(userId);

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, console as any),
    },
    printQRInTerminal: false, // we handle QR ourselves
    browser: ['Skedmate', 'Chrome', '120.0'],
    // Keeps messages in-memory to a minimum; we don't need history
    getMessage: async () => undefined,
  });

  sessions.set(userId, { sock, connecting: true });

  // ── Persist credentials whenever they update ──────────────────────────────
  sock.ev.on('creds.update', saveCreds);

  // ── QR code ───────────────────────────────────────────────────────────────
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && onQR) {
      // Convert the raw QR string to a data-URL PNG
      const qrcode = await import('qrcode');
      const dataUrl = await qrcode.toDataURL(qr);
      onQR(dataUrl);
    }

    if (connection === 'open') {
      const entry = sessions.get(userId);
      if (entry) entry.connecting = false;
      console.log(`[SessionManager] ✅ User ${userId} connected`);
      onOpen?.();
    }

    if (connection === 'close') {
      sessions.delete(userId);

      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      console.log(
        `[SessionManager] ⚠️  User ${userId} disconnected (code=${statusCode}, loggedOut=${loggedOut})`
      );

      if (loggedOut) {
        // Wipe the stored credentials so the user has to re-scan next time
        await deleteAuthState(userId);
      } else {
        // Any other disconnect reason → reconnect after a short back-off
        const delay = 3000 + Math.random() * 2000;
        setTimeout(() => connectUser(userId, onQR, onOpen), delay);
      }
    }
  });

  // ── Incoming messages → buffer then route through messageController ─────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      // Ignore outgoing messages (fromMe) and empty stubs
      if (msg.key.fromMe || !msg.message) continue;

      try {
        const jid = msg.key.remoteJid ?? '';
        // Strip @s.whatsapp.net → plain E.164 number
        const senderPhone = jid.replace('@s.whatsapp.net', '').replace(/[^0-9+]/g, '');

        const textContent =
          msg.message.conversation ??
          msg.message.extendedTextMessage?.text ??
          '';

        // Check for media
        const imageMsg = msg.message.imageMessage;
        const videoMsg = msg.message.videoMessage;
        const audioMsg = msg.message.audioMessage;
        const docMsg   = msg.message.documentMessage;

        let mediaUrl: string | null = null;
        let mediaType: string | null = null;
        let msgType = 'text';

        if (imageMsg) {
          msgType = 'image';
          mediaType = imageMsg.mimetype ?? 'image/jpeg';
          // Note: downloading media requires sock.downloadMediaMessage — 
          // for now we pass the caption only and skip binary media routing.
          // You can expand this with a Cloudinary upload step here.
        } else if (videoMsg) {
          msgType = 'video';
          mediaType = videoMsg.mimetype ?? 'video/mp4';
        } else if (audioMsg) {
          msgType = 'audio';
          mediaType = audioMsg.mimetype ?? 'audio/ogg';
        } else if (docMsg) {
          msgType = 'document';
          mediaType = docMsg.mimetype ?? 'application/octet-stream';
        }

        const { bufferMessage } = await import('../services/buffer.js');
        await bufferMessage(senderPhone, {
          type: msgType,
          text: textContent || undefined,
          mediaUrl,
          mediaType,
        });
      } catch (err) {
        console.error('[SessionManager] Error processing inbound message:', err);
      }
    }
  });
}

// ─── Public helpers ───────────────────────────────────────────────────────────

/**
 * Return the active WASocket for a user, or null if not connected.
 */
export function getSocket(userId: string): WASocket | null {
  return sessions.get(userId)?.sock ?? null;
}

/**
 * Disconnect a user cleanly and delete their auth state (logout).
 */
export async function logoutUser(userId: string): Promise<void> {
  const entry = sessions.get(userId);
  if (entry) {
    try {
      await entry.sock.logout();
    } catch {
      // socket may already be gone
    }
    sessions.delete(userId);
  }
  await deleteAuthState(userId);
  console.log(`[SessionManager] 🚪 User ${userId} logged out`);
}

/**
 * On server start: reconnect every user that already has saved credentials.
 * Call this once from index.ts after the DB is ready.
 */
export async function restoreAllSessions(): Promise<void> {
  // Find all users who have a 'creds' row (i.e., previously authenticated)
  const rows = await prisma.whatsAppSession.findMany({
    where: { keyType: 'creds' },
    select: { userId: true },
  });

  console.log(`[SessionManager] Restoring ${rows.length} session(s)...`);

  for (const { userId } of rows) {
    // Stagger reconnects slightly to avoid hammering WhatsApp at startup
    const jitter = Math.random() * 2000;
    setTimeout(() => connectUser(userId), jitter);
  }
}
