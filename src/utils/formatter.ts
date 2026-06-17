/**
 * Format a Date object into a human-readable string for WhatsApp messages.
 * e.g. "Friday, 14 June 2025 at 9:00 AM"
 */
export function formatDate(date: Date, timezone: string = 'Africa/Lagos'): string {
  return date.toLocaleString('en-GB', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Normalise a phone number — strip spaces, dashes, and ensure it starts with +
 */
export function normalisePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-().]/g, '');
  if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  return cleaned;
}

/**
 * Validate a phone number — basic E.164 check
 */
export function isValidPhone(phone: string): boolean {
  return /^\+\d{7,15}$/.test(phone);
}

/**
 * Parse a comma-separated list of phone numbers and return valid ones.
 */
export function parsePhoneList(input: string): { valid: string[]; invalid: string[] } {
  const parts = input.split(',').map((p) => normalisePhone(p.trim()));
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const p of parts) {
    if (isValidPhone(p)) valid.push(p);
    else invalid.push(p);
  }
  return { valid, invalid };
}

/**
 * Build the main menu message for a given user name.
 */
export function buildMainMenu(name: string): string {
  return (
    `Hey ${name}! 👋 What would you like to do?\n\n` +
    `1️⃣  Schedule a message\n` +
    `2️⃣  Schedule a file or media\n` +
    `3️⃣  Broadcast to contacts\n` +
    `4️⃣  Set a recurring reminder\n` +
    `5️⃣  View my scheduled messages\n` +
    `6️⃣  Cancel a scheduled message\n` +
    `7️⃣  Settings\n\n` +
    `Just reply with a number to get started 😊\n\n` +
    `💡 Tip: Reply 0 at any time to cancel and return here.`
  );
}

/**
 * Truncate a string to a max length with ellipsis.
 */
export function truncate(str: string, max: number = 50): string {
  return str.length > max ? str.slice(0, max) + '…' : str;
}
