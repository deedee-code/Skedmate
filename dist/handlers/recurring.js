import { sendText } from '../services/whatsapp.js';
import { setState, updateContext } from '../utils/stateManager.js';
// Recurring flows reuse the scheduleText handlers for content/recipient/time steps.
// This handler only manages the extra recurrence-selection step.
const RECURRENCE_OPTIONS = `How often should this repeat?\n\nReply:\ndaily\nweekly\nmonthly\ncustom`;
/**
 * Ask the user to choose a recurrence frequency.
 * Called after content + recipient have been collected.
 */
export async function handleAwaitingRecurrence(phone, msg) {
    const input = msg.text?.trim().toLowerCase() ?? '';
    const valid = ['daily', 'weekly', 'monthly', 'custom'];
    if (!valid.includes(input)) {
        await sendText(phone, `Please choose one of: daily, weekly, monthly, custom`);
        return;
    }
    if (input === 'custom') {
        await updateContext(phone, { recurrence: 'custom' });
        await setState(phone, 'AWAITING_CUSTOM_RECURRENCE');
        await sendText(phone, 'Describe your custom schedule — e.g. "every Monday and Thursday at 8am" or "every 2 weeks on Friday".\n\n(I\'ll do my best to set it up for you!)');
        return;
    }
    await updateContext(phone, { recurrence: input });
    await setState(phone, 'AWAITING_TIME');
    await sendText(phone, `Got it — ${input}! 🔁\n\nWhat time should it send each ${input === 'daily' ? 'day' : input === 'weekly' ? 'week' : 'month'}?\n\nExample: "9am" or "Friday at 3pm"`);
}
/**
 * Handle custom recurrence description.
 * For MVP we store the raw description and treat it as a one-time schedule.
 * A future version can parse cron expressions from this.
 */
export async function handleAwaitingCustomRecurrence(phone, msg) {
    const description = msg.text?.trim() ?? '';
    if (!description) {
        await sendText(phone, 'Please describe your custom schedule.');
        return;
    }
    // Store the custom description as the recurrence value
    await updateContext(phone, { recurrence: `custom:${description}` });
    await setState(phone, 'AWAITING_TIME');
    await sendText(phone, `Got it! 📝 I've noted your custom schedule.\n\nWhen should the first one send?\n\nExample: "tomorrow 9am" or "next Monday at 8am"`);
}
//# sourceMappingURL=recurring.js.map