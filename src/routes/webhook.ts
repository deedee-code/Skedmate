import { Router, Request, Response } from 'express';
import twilio from 'twilio';
import { bufferMessage } from '../services/buffer.js';

const router = Router();

// Twilio signature validation middleware
// In production, set TWILIO_AUTH_TOKEN and ensure your server is behind HTTPS
const validateTwilio = twilio.webhook({
  protocol: 'https',
  validate: process.env.NODE_ENV === 'production',
});

/**
 * POST /webhook
 * Twilio sends all incoming WhatsApp messages here.
 */
router.post(
  '/',
  validateTwilio,
  async (req: Request, res: Response): Promise<void> => {
    // Respond immediately with empty TwiML — Twilio expects a fast response and no text echo
    res.status(200).type('text/xml').send('<Response/>');

    try {
      const body = req.body as Record<string, string>;
      console.log('📬 [Webhook] Raw Body:', JSON.stringify(body, null, 2));

      const from = (body.From ?? '').replace('whatsapp:', '');
      const numMedia = parseInt(body.NumMedia ?? '0', 10);
      const rawContentType = body.MediaContentType0 ?? '';

      const mediaType = numMedia > 0 ? detectMediaType(rawContentType) : null;

      const incoming = {
        type: mediaType ?? 'text',
        text: body.Body ?? '',
        mediaUrl: body.MediaUrl0 ?? null,
        mediaType: rawContentType || null,
        mediaCaption: body.Body ?? null, // Twilio puts caption in Body when media is sent
      };

      await bufferMessage(from, incoming);
    } catch (err) {
      console.error('[webhook] Error processing incoming message:', err);
    }
  }
);

/**
 * Map a MIME content type to a simplified media type string.
 */
function detectMediaType(contentType: string): string | null {
  if (!contentType) return null;
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  if (contentType.startsWith('text/vcard') || contentType.startsWith('text/x-vcard')) return 'contact';
  return 'document';
}

export default router;
