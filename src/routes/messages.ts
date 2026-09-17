import { Router, Request, Response } from 'express';
import prisma from '../db/prisma.js';
import { sendText } from '../services/whatsapp.js';

const router = Router();

/**
 * POST /messages/send
 * Body: { phone: string, message: string }
 * Sends a text message from the user's linked WhatsApp session to `phone`.
 */
router.post('/send', async (req: Request, res: Response): Promise<void> => {
  const { phone, message } = req.body as { phone?: string; message?: string };

  if (!phone || !message) {
    res.status(400).json({ error: 'phone and message are required' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    res.status(404).json({ error: 'user not found for phone' });
    return;
  }

  try {
    await sendText(user.id, phone, message);
    res.json({ status: 'sent' });
  } catch (err: any) {
    const msg = err?.message ?? 'unknown error';
    res.status(500).json({ error: msg });
  }
});

export default router;
