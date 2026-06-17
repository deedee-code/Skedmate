import twilio from 'twilio';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID as string,
  process.env.TWILIO_AUTH_TOKEN as string
);

const FROM = `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`;

/**
 * Send a plain text WhatsApp message.
 */
export async function sendText(to: string, body: string): Promise<void> {
  await client.messages.create({
    from: FROM,
    to: `whatsapp:${to}`,
    body,
  });
}

/**
 * Send a media WhatsApp message (image, video, audio, document).
 * Optionally include a caption.
 */
export async function sendMedia(
  to: string,
  mediaUrl: string,
  caption?: string | null
): Promise<void> {
  await client.messages.create({
    from: FROM,
    to: `whatsapp:${to}`,
    body: caption ?? '',
    mediaUrl: [mediaUrl],
  });
}

/**
 * Send either text, media, or both — convenience wrapper used by the job worker.
 */
export async function sendMessage(params: {
  to: string;
  textContent?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
}): Promise<void> {
  const { to, textContent, mediaUrl } = params;

  if (mediaUrl) {
    await sendMedia(to, mediaUrl, textContent);
  } else if (textContent) {
    await sendText(to, textContent);
  }
}
