import prisma from '../db/prisma.js';
import { getState, setState } from '../utils/stateManager.js';
import { buildMainMenu } from '../utils/formatter.js';
import { replyToUser } from '../services/whatsapp.js';
import { handleNewUser, handleAwaitingName } from '../handlers/onboarding.js';
import { handleMainMenu } from '../handlers/mainMenu.js';
import {
  handleAwaitingContent,
  handleAwaitingRecipient,
  handleAwaitingTime,
} from '../handlers/scheduleText.js';
import {
  handleAwaitingBroadcastNumbers,
  handleAwaitingBroadcastConfirm,
  handleAwaitingBroadcastContent,
  handleAwaitingBroadcastTime,
} from '../handlers/broadcast.js';
import {
  handleAwaitingRecurrence,
  handleAwaitingCustomRecurrence,
} from '../handlers/recurring.js';
import { handleAwaitingCancelId } from '../handlers/cancelSchedule.js';
import {
  handleAwaitingSettingsChoice,
  handleAwaitingNewTimezone,
} from '../handlers/settings.js';
import type { BufferedMessage } from '../services/buffer.js';

/**
 * Central message router.
 * Called by the buffer after grouping text + media from the same user.
 */
export async function processMessage(phone: string, msg: BufferedMessage): Promise<void> {
  try {
    // Look up the user
    const user = await prisma.user.findUnique({ where: { phone } });

    // Brand new user — start onboarding
    if (!user) {
      await handleNewUser(phone);
      return;
    }

    // Get current conversation state
    const stateData = await getState(phone);

    // No state yet — show main menu
    if (!stateData) {
      await replyToUser(phone, buildMainMenu(user.name ?? 'there'));
      return;
    }

    const { state, context } = stateData;
    const mode = context?.mode as string | undefined;

    // ── Global Escape Hatch ──
    // Allow the user to go back to the main menu at any time by typing specific keywords.
    const inputLower = msg.text?.trim().toLowerCase() ?? '';
    if (['menu', 'back', 'cancel', '0'].includes(inputLower) && state !== 'MAIN_MENU') {
      await setState(phone, 'MAIN_MENU');
      await replyToUser(phone, buildMainMenu(user.name ?? 'there'));
      return;
    }

    switch (state) {
      case 'AWAITING_NAME':
        await handleAwaitingName(phone, msg);
        break;

      case 'MAIN_MENU':
        await handleMainMenu(phone, msg, user.name ?? 'there');
        break;

      // ── Schedule / Media / Recurring share the same content→recipient→time flow ──
      case 'AWAITING_CONTENT':
        await handleAwaitingContent(phone, msg);
        break;

      case 'AWAITING_RECIPIENT':
        if (mode === 'recurring') {
          // After recipient, ask for recurrence frequency
          await handleAwaitingRecipient(phone, msg);
          // Override next state to recurrence selection
          const { setState } = await import('../utils/stateManager.js');
          await setState(phone, 'AWAITING_RECURRENCE');
          await replyToUser(
            phone,
            'How often should this repeat?\n\nReply:\ndaily\nweekly\nmonthly\ncustom'
          );
        } else {
          await handleAwaitingRecipient(phone, msg);
        }
        break;

      case 'AWAITING_RECURRENCE':
        await handleAwaitingRecurrence(phone, msg);
        break;

      case 'AWAITING_CUSTOM_RECURRENCE':
        await handleAwaitingCustomRecurrence(phone, msg);
        break;

      case 'AWAITING_TIME':
        await handleAwaitingTime(phone, msg);
        break;

      // ── Broadcast flow ──
      case 'AWAITING_BROADCAST_NUMBERS':
        await handleAwaitingBroadcastNumbers(phone, msg);
        break;

      case 'AWAITING_BROADCAST_CONFIRM':
        await handleAwaitingBroadcastConfirm(phone, msg);
        break;

      case 'AWAITING_BROADCAST_CONTENT':
        await handleAwaitingBroadcastContent(phone, msg);
        break;

      case 'AWAITING_BROADCAST_TIME':
        await handleAwaitingBroadcastTime(phone, msg);
        break;

      // ── Cancel flow ──
      case 'AWAITING_CANCEL_ID':
        await handleAwaitingCancelId(phone, msg);
        break;

      // ── Settings flow ──
      case 'AWAITING_SETTINGS_CHOICE':
        await handleAwaitingSettingsChoice(phone, msg);
        break;

      case 'AWAITING_NEW_TIMEZONE':
        await handleAwaitingNewTimezone(phone, msg);
        break;

      default:
        // Fallback — reset to main menu
        await replyToUser(phone, buildMainMenu(user.name ?? 'there'));
        break;
    }
  } catch (err) {
    console.error('[messageController] Unhandled error:', err);
    await replyToUser(
      phone,
      "Oops, something went wrong on my end 😅 Please try again in a moment."
    );
  }
}
