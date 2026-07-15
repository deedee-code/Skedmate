import prisma from '../db/prisma.js';
import { replyToUser } from '../services/whatsapp.js';
import { setState } from '../utils/stateManager.js';
import { buildMainMenu } from '../utils/formatter.js';
import type { BufferedMessage } from '../services/buffer.js';

// A curated list of common timezones — users can type any valid IANA timezone
const COMMON_TIMEZONES = [
  'Africa/Lagos',
  'Africa/Nairobi',
  'Africa/Accra',
  'Africa/Johannesburg',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Kolkata',
];

/**
 * Handle the settings menu selection.
 */
export async function handleAwaitingSettingsChoice(
  phone: string,
  msg: BufferedMessage
): Promise<void> {
  const input = msg.text?.trim() ?? '';

  if (input === '1') {
    await setState(phone, 'AWAITING_NEW_TIMEZONE');
    await replyToUser(
      phone,
      `What's your timezone? 🌍\n\nCommon options:\n${COMMON_TIMEZONES.join('\n')}\n\nOr type any valid timezone (e.g. America/Chicago).`
    );
  } else {
    const user = await prisma.user.findUnique({ where: { phone } });
    await replyToUser(phone, 'Invalid option. Please reply with a number from the settings menu.');
    await setState(phone, 'AWAITING_SETTINGS_CHOICE');
    await replyToUser(phone, `⚙️ Settings\n\n1️⃣  Change timezone\n\nReply with a number.`);
  }
}

/**
 * Handle the new timezone input.
 */
export async function handleAwaitingNewTimezone(
  phone: string,
  msg: BufferedMessage
): Promise<void> {
  const input = msg.text?.trim() ?? '';

  // Validate the timezone
  if (!isValidTimezone(input)) {
    await replyToUser(
      phone,
      `"${input}" doesn't look like a valid timezone 🤔\n\nTry one of:\n${COMMON_TIMEZONES.join('\n')}`
    );
    return;
  }

  await prisma.user.update({
    where: { phone },
    data: { timezone: input },
  });

  await replyToUser(phone, `✅ Timezone updated to ${input}!`);

  const user = await prisma.user.findUnique({ where: { phone } });
  await setState(phone, 'MAIN_MENU');
  await replyToUser(phone, buildMainMenu(user?.name ?? 'there'));
}

/**
 * Check if a string is a valid IANA timezone identifier.
 */
function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
