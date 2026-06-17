import prisma from '../db/prisma.js';
import { sendText } from '../services/whatsapp.js';
import { setState } from '../utils/stateManager.js';
import { buildMainMenu } from '../utils/formatter.js';
import type { BufferedMessage } from '../services/buffer.js';

const INTRO_MESSAGE = `Hey there! 👋 I'm Skedmate — your personal scheduling buddy on WhatsApp.

Whether you're sending a birthday message at midnight, blasting a promo to your customers, or setting a weekly reminder for your team — I've got you covered. 😎

Here's what I can do for you:
📝 Schedule text messages to anyone
📎 Schedule files, images & media
📣 Broadcast to multiple contacts at once
🔁 Set recurring reminders
📅 View your scheduled messages
❌ Cancel a scheduled message
⚙️ Manage your settings

To get started, what's your name?`;

/**
 * Handle a brand-new user — send the intro and ask for their name.
 */
export async function handleNewUser(phone: string): Promise<void> {
  // Create an initial user record without a name so the router recognizes them on the next message
  await prisma.user.upsert({
    where: { phone },
    update: {},
    create: { phone },
  });

  await sendText(phone, INTRO_MESSAGE);
  await setState(phone, 'AWAITING_NAME');
}

/**
 * Helper to extract just the name from common conversational responses.
 * E.g., "My name is Tunde" -> "Tunde", "I'm Sarah" -> "Sarah"
 */
function extractName(input: string): string {
  let text = input.trim();
  
  // Strip common prefixes (case-insensitive)
  const prefixRegex = /^(?:my name is|i am|i'm|im|this is|it is|it's|they call me|call me|just)\s+/i;
  text = text.replace(prefixRegex, '');

  // Strip common suffixes (case-insensitive)
  const suffixRegex = /\s+(?:is my name|is what they call me|here)$/i;
  text = text.replace(suffixRegex, '');

  return text.trim() || input.trim(); // Fallback to original input if we accidentally stripped everything
}

/**
 * Handle the user's name reply during onboarding.
 */
export async function handleAwaitingName(phone: string, msg: BufferedMessage): Promise<void> {
  const rawInput = msg.text ?? '';
  const name = extractName(rawInput);

  if (!name || name.length < 2) {
    await sendText(phone, "I didn't catch that — what's your name? 😊");
    return;
  }

  // Save user to DB
  await prisma.user.upsert({
    where: { phone },
    update: { name },
    create: { phone, name },
  });

  await sendText(phone, `Nice to meet you, ${name}! 🎉`);
  await setState(phone, 'MAIN_MENU');
  await sendText(phone, buildMainMenu(name));
}
