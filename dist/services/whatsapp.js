import twilio from 'twilio';
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const FROM = `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`;
/**
 * Send a plain text WhatsApp message.
 */
export async function sendText(to, body) {
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
export async function sendMedia(to, mediaUrl, caption) {
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
export async function sendMessage(params) {
    const { to, textContent, mediaUrl } = params;
    if (mediaUrl) {
        await sendMedia(to, mediaUrl, textContent);
    }
    else if (textContent) {
        await sendText(to, textContent);
    }
}
//# sourceMappingURL=whatsapp.js.map