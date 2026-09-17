import { Router, Request, Response } from 'express';
import { bufferMessage } from '../services/buffer.js';

const router = Router();

/**
 * POST /dev/simulate
 * Body: { phone: string, text?: string, type?: string }
 * Simulates an incoming message from `phone` for local testing.
 * This endpoint is gated by the `ALLOW_DEV_ENDPOINTS` env var.
 */
router.post('/simulate', async (req: Request, res: Response): Promise<void> => {
  if (process.env.ALLOW_DEV_ENDPOINTS !== 'true') {
    res.status(403).json({ error: 'dev endpoints disabled' });
    return;
  }

  const { phone, text, type } = req.body as { phone?: string; text?: string; type?: string };
  if (!phone) {
    res.status(400).json({ error: 'phone is required' });
    return;
  }

  const msgType = type ?? (text ? 'text' : 'image');

  await bufferMessage(phone, {
    type: msgType,
    text: text ?? undefined,
    mediaUrl: null,
    mediaType: null,
    mediaCaption: null,
  });

  res.json({ status: 'simulated' });
});

export default router;
