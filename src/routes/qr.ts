/**
 * qr.ts
 *
 * Endpoints for linking and unlinking a user's WhatsApp account.
 *
 * POST /session/connect  — Start a session; returns a QR code data-URL
 * POST /session/logout   — Log the user out and delete stored credentials
 * GET  /session/status   — Check if the user's socket is currently live
 *
 * Authentication: In production, protect these routes with your real auth
 * middleware. For now they accept a plain `userId` in the request body / query.
 */

import { Router, Request, Response } from 'express';
import { connectUser, logoutUser, getSocket } from '../services/sessionManager.js';
import prisma from '../db/prisma.js';

const router = Router();

// ─── POST /session/connect ────────────────────────────────────────────────────

router.post('/connect', async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.body as { userId?: string };

  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  // Make sure the user exists in the DB
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Already connected? allow forcing a reconnect by passing `force: true` in body
  const { force } = req.body as { force?: boolean };
  if (getSocket(userId)) {
    if (force) {
      await logoutUser(userId).catch(() => { /* ignore logout errors and continue */ });
    } else {
      res.json({ status: 'already_connected' });
      return;
    }
  }

  // Start the connection and capture the first QR code via a promise
  let qrResolve: ((dataUrl: string) => void) | null = null;
  let qrReject: ((err: Error) => void) | null = null;

  const qrPromise = new Promise<string>((resolve, reject) => {
    qrResolve = resolve;
    qrReject = reject;
  });

  // Configurable timeout (ms) for QR generation via `QR_TIMEOUT_MS` env var
  const qrTimeoutMs = Number(process.env.QR_TIMEOUT_MS ?? '30000');
  const timeout = setTimeout(() => {
    qrReject?.(new Error('QR code generation timed out'));
  }, qrTimeoutMs);

  connectUser(
    userId,
    (qrDataUrl) => {
      clearTimeout(timeout);
      qrResolve?.(qrDataUrl);
      qrResolve = null; // only capture the first QR
    },
    () => {
      // If it connects instantly (session already saved), resolve without a QR
      clearTimeout(timeout);
      qrResolve?.('already_authenticated');
      qrResolve = null;
    }
  ).catch((err) => {
    clearTimeout(timeout);
    qrReject?.(err as Error);
  });

  try {
    const result = await qrPromise;

    if (result === 'already_authenticated') {
      res.json({ status: 'connected', qr: null });
    } else {
      // Return the QR as a data-URL so the frontend can render it in an <img>
      res.json({ status: 'awaiting_scan', qr: result });
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── POST /session/logout ─────────────────────────────────────────────────────

router.post('/logout', async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.body as { userId?: string };

  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  await logoutUser(userId);
  res.json({ status: 'logged_out' });
});

// ─── GET /session/status ──────────────────────────────────────────────────────

router.get('/status', async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.query as { userId?: string };

  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  const connected = getSocket(userId) !== null;
  res.json({ userId, connected });
});

export default router;

// ─── POST /session/disconnect ───────────────────────────────────────────────
// Force-close the socket but keep auth state (useful to re-scan without wiping creds)
router.post('/disconnect', async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.body as { userId?: string };

  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  const sock = getSocket(userId);
  if (!sock) {
    res.json({ status: 'no_active_session' });
    return;
  }

  try {
    // Close socket without deleting auth rows so the next connect can re-use creds
    await sock.logout?.().catch(() => { /* ignore logout errors */ });
    res.json({ status: 'disconnected' });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'unknown' });
  }
});
