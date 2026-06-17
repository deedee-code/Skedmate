import prisma from '../db/prisma.js';
import { sendText } from '../services/whatsapp.js';
import { setState, updateContext, getState } from '../utils/stateManager.js';
import { scheduleJob } from '../services/scheduler.js';
import { parseTime } from '../services/timeParser.js';
import { uploadFromUrl } from '../services/storage.js';
import { parseVCardFromUrl } from '../services/vcard.js';
import { formatDate, isValidPhone, normalisePhone, buildMainMenu } from '../utils/formatter.js';
/**
 * Step 1 — User has sent their content (text / media / both).
 * Store it in context and ask for the recipient.
 */
export async function handleAwaitingContent(phone, msg) {
    if (!msg.text && !msg.media) {
        await sendText(phone, "I didn't receive anything 🤔 Please send your message — text, image, or both.");
        return;
    }
    let mediaUrl = null;
    let mediaType = null;
    // Upload media to Cloudinary if present
    if (msg.media) {
        try {
            const uploaded = await uploadFromUrl(msg.media.url, msg.media.type);
            mediaUrl = uploaded.url;
            mediaType = msg.media.type;
        }
        catch (err) {
            console.error('[scheduleText] Cloudinary upload failed:', err);
            await sendText(phone, '❌ Failed to upload your media. Please try again.');
            return;
        }
    }
    await updateContext(phone, {
        textContent: msg.text ?? null,
        mediaUrl,
        mediaType,
    });
    await setState(phone, 'AWAITING_RECIPIENT');
    await sendText(phone, "Who should receive this? Send their WhatsApp number (or tap 📎 and share a Contact).\n\nExample: +2348012345678");
}
/**
 * Step 2 — User has sent the recipient number.
 */
export async function handleAwaitingRecipient(phone, msg) {
    let recipient = '';
    if (msg.media?.type === 'contact') {
        const numbers = await parseVCardFromUrl(msg.media.url);
        if (numbers.length > 0) {
            recipient = numbers[0]; // Use the first valid number found
        }
        else {
            await sendText(phone, "I couldn't find a valid phone number in that contact 🤔");
            return;
        }
    }
    else {
        const raw = msg.text?.trim() ?? '';
        recipient = normalisePhone(raw);
    }
    if (!isValidPhone(recipient)) {
        await sendText(phone, "That doesn't look like a valid phone number 🤔\n\nPlease send a number in international format or share a Contact via 📎");
        return;
    }
    await updateContext(phone, { recipient });
    await setState(phone, 'AWAITING_TIME');
    await sendText(phone, 'When should it be sent? 📅\n\nYou can say things like:\n• "tomorrow 9am"\n• "Friday at 3pm"\n• "in 2 hours"\n• "25 December at noon"');
}
/**
 * Step 3 — User has sent the time. Parse, confirm, and save.
 */
export async function handleAwaitingTime(phone, msg) {
    const stateData = await getState(phone);
    const ctx = stateData?.context ?? {};
    const timeInput = msg.text?.trim() ?? '';
    const user = await prisma.user.findUnique({ where: { phone } });
    const timezone = user?.timezone ?? 'Africa/Lagos';
    const sendAt = parseTime(timeInput, timezone);
    if (!sendAt) {
        await sendText(phone, "I couldn't understand that time 🤔 Try something like:\n• \"tomorrow 9am\"\n• \"next Friday at 3pm\"\n• \"in 2 hours\"");
        return;
    }
    const mode = ctx.mode;
    const recurrence = ctx.recurrence;
    // Save to DB
    const schedule = await prisma.schedule.create({
        data: {
            userId: user.id,
            recipient: ctx.recipient,
            textContent: ctx.textContent ?? null,
            mediaUrl: ctx.mediaUrl ?? null,
            mediaType: ctx.mediaType ?? null,
            sendAt,
            recurrence: recurrence ?? null,
            status: 'pending',
        },
    });
    // Queue the job
    await scheduleJob(schedule.id, sendAt);
    const formattedTime = formatDate(sendAt, timezone);
    const contentDesc = ctx.mediaUrl
        ? ctx.textContent
            ? 'message with media'
            : 'media'
        : 'message';
    await sendText(phone, `✅ Got it! I'll send your ${contentDesc} to ${ctx.recipient} on ${formattedTime}.\n\nID: ${schedule.id.slice(0, 8)} (save this if you want to cancel later)`);
    // Schedule a 30-min pre-send reminder
    const reminderAt = new Date(sendAt.getTime() - 30 * 60_000);
    if (reminderAt > new Date()) {
        const reminderSchedule = await prisma.schedule.create({
            data: {
                userId: user.id,
                recipient: phone, // send reminder to the sender themselves
                textContent: `⏰ Heads up! Your scheduled message to ${ctx.recipient} is going out in 30 minutes.`,
                sendAt: reminderAt,
                status: 'pending',
            },
        });
        await scheduleJob(reminderSchedule.id, reminderAt);
    }
    await setState(phone, 'MAIN_MENU');
    await sendText(phone, buildMainMenu(user?.name ?? 'there'));
}
//# sourceMappingURL=scheduleText.js.map