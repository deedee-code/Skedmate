import prisma from '../db/prisma.js';
import { sendText } from '../services/whatsapp.js';
import { setState } from '../utils/stateManager.js';
import { formatDate, truncate, buildMainMenu } from '../utils/formatter.js';

/**
 * Show the user their pending scheduled messages.
 */
export async function handleViewSchedules(phone: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) return;

  const schedules = await prisma.schedule.findMany({
    where: { userId: user.id, status: 'pending' },
    orderBy: { sendAt: 'asc' },
    take: 10,
  });

  if (schedules.length === 0) {
    await sendText(phone, "You don't have any scheduled messages right now. 📭");
    await setState(phone, 'MAIN_MENU');
    await sendText(phone, buildMainMenu(user.name ?? 'there'));
    return;
  }

  const lines = schedules.map((s, i) => {
    const preview = s.textContent ? truncate(s.textContent, 40) : s.mediaType ?? 'media';
    const time = formatDate(s.sendAt, user.timezone);
    const recur = s.recurrence ? ` 🔁 ${s.recurrence}` : '';
    return `${i + 1}. ID: ${s.id.slice(0, 8)}\nTo: ${s.recipient}\nMsg: ${preview}\nWhen: ${time}${recur}`;
  });

  const message =
    `📅 Your scheduled messages (${schedules.length}):\n\n` +
    lines.join('\n\n') +
    '\n\nTo cancel one, reply with option 6 from the main menu.';

  await sendText(phone, message);
  await setState(phone, 'MAIN_MENU');
  await sendText(phone, buildMainMenu(user.name ?? 'there'));
}
