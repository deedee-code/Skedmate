import prisma from '../db/prisma.js';
import { sendText } from '../services/whatsapp.js';
import { setState, updateContext, getState } from '../utils/stateManager.js';
import { scheduleBroadcastJob } from '../services/scheduler.js';
import { parseTime } from '../services/timeParser.js';
import { uploadFromUrl } from '../services/storage.js';
import { parseVCardFromUrl } from '../services/vcard.js';
import { formatDate, parsePhoneList, buildMainMenu } from '../utils/formatter.js';
const OPT_IN_WARNING = 'Please confirm all recipients have agreed to receive messages from you.\n\nReply YES to continue or NO to cancel.';
/**
 * Step 1 — User has sent the recipient numbers.
 */
export async function handleAwaitingBroadcastNumbers(phone, msg) {
    let valid = [];
    let invalid = [];
    if (msg.media?.type === 'contact') {
        const numbers = await parseVCardFromUrl(msg.media.url);
        if (numbers.length === 0) {
            await sendText(phone, "I couldn't find any valid phone numbers in that contact 🤔");
            return;
        }
        valid = numbers;
    }
    else {
        const input = msg.text?.trim() ?? '';
        const parsed = parsePhoneList(input);
        valid = parsed.valid;
        invalid = parsed.invalid;
    }
    if (valid.length === 0) {
        await sendText(phone, "I couldn't find any valid phone numbers 🤔\n\nPlease send numbers separated by commas, or share a Contact via 📎");
        return;
    }
    let warning = '';
    if (invalid.length > 0) {
        warning = `\n\n⚠️ Skipped ${invalid.length} invalid number(s): ${invalid.join(', ')}`;
    }
    await updateContext(phone, { recipients: valid });
    await setState(phone, 'AWAITING_BROADCAST_CONFIRM');
    await sendText(phone, OPT_IN_WARNING + warning);
}
/**
 * Step 2 — Opt-in confirmation.
 */
export async function handleAwaitingBroadcastConfirm(phone, msg) {
    const input = msg.text?.trim().toUpperCase() ?? '';
    if (input === 'NO') {
        await setState(phone, 'MAIN_MENU');
        const user = await prisma.user.findUnique({ where: { phone } });
        await sendText(phone, 'Broadcast cancelled. 👍');
        await sendText(phone, buildMainMenu(user?.name ?? 'there'));
        return;
    }
    if (input !== 'YES') {
        await sendText(phone, 'Please reply YES to continue or NO to cancel.');
        return;
    }
    await setState(phone, 'AWAITING_BROADCAST_CONTENT');
    await sendText(phone, 'Now send your message — text, file, or both 👇\n\n(I\'ll wait a few seconds to group them together!)');
}
/**
 * Step 3 — User has sent the broadcast content.
 */
export async function handleAwaitingBroadcastContent(phone, msg) {
    if (!msg.text && !msg.media) {
        await sendText(phone, "I didn't receive anything 🤔 Please send your message — text, image, or both.");
        return;
    }
    let mediaUrl = null;
    let mediaType = null;
    if (msg.media) {
        try {
            const uploaded = await uploadFromUrl(msg.media.url, msg.media.type);
            mediaUrl = uploaded.url;
            mediaType = msg.media.type;
        }
        catch (err) {
            console.error('[broadcast] Cloudinary upload failed:', err);
            await sendText(phone, '❌ Failed to upload your media. Please try again.');
            return;
        }
    }
    await updateContext(phone, {
        textContent: msg.text ?? null,
        mediaUrl,
        mediaType,
    });
    await setState(phone, 'AWAITING_BROADCAST_TIME');
    await sendText(phone, 'Send now or schedule for later?\n\nReply "now" or a time like "tomorrow 9am".');
}
/**
 * Step 4 — User has chosen when to send.
 */
export async function handleAwaitingBroadcastTime(phone, msg) {
    const stateData = await getState(phone);
    const ctx = stateData?.context ?? {};
    const input = msg.text?.trim().toLowerCase() ?? '';
    const user = await prisma.user.findUnique({ where: { phone } });
    const timezone = user?.timezone ?? 'Africa/Lagos';
    let sendAt;
    if (input === 'now') {
        sendAt = new Date(Date.now() + 5000); // 5 seconds from now
    }
    else {
        const parsed = parseTime(input, timezone);
        if (!parsed) {
            await sendText(phone, "I couldn't understand that time 🤔 Try \"now\" or something like \"tomorrow 9am\".");
            return;
        }
        sendAt = parsed;
    }
    const recipients = ctx.recipients;
    // Save broadcast to DB
    const broadcast = await prisma.broadcast.create({
        data: {
            userId: user.id,
            recipients,
            textContent: ctx.textContent ?? null,
            mediaUrl: ctx.mediaUrl ?? null,
            mediaType: ctx.mediaType ?? null,
            sendAt,
            status: 'pending',
        },
    });
    // Queue one job per recipient
    for (const recipient of recipients) {
        await scheduleBroadcastJob(broadcast.id, recipient, sendAt);
    }
    const timeLabel = input === 'now' ? 'right now' : formatDate(sendAt, timezone);
    await sendText(phone, `✅ Broadcast queued for ${recipients.length} contact${recipients.length > 1 ? 's' : ''} at ${timeLabel}. 🚀`);
    await setState(phone, 'MAIN_MENU');
    await sendText(phone, buildMainMenu(user?.name ?? 'there'));
}
//# sourceMappingURL=broadcast.js.map