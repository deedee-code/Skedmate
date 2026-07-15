import prisma from '../db/prisma.js';
import { replyToUser } from '../services/whatsapp.js';
import { setState } from '../utils/stateManager.js';
import { cancelJob } from '../services/scheduler.js';
import { buildMainMenu } from '../utils/formatter.js';
import type { BufferedMessage } from '../services/buffer.js';

/**
 * Handle the user's cancel request — they send the short ID (first 8 chars).
 */
export async function handleAwaitingCancelId(
  phone: string,
  msg: BufferedMessage
): Promise<void> {
  const input = msg.text?.trim() ?? '';
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) return;

  // Find the schedule by partial ID prefix
  const schedule = await prisma.schedule.findFirst({
    where: {
      userId: user.id,
      id: { startsWith: input },
      status: 'pending',
    },
  });

  if (!schedule) {
    await replyToUser(
      phone,
      `❌ I couldn't find a pending message with ID starting with "${input}".\n\nCheck your scheduled messages (option 5) and try again.`
    );
    return;
  }

  // Cancel the BullMQ job
  await cancelJob(schedule.id);

  // Mark as cancelled in DB
  await prisma.schedule.update({
    where: { id: schedule.id },
    data: { status: 'cancelled' },
  });

  await replyToUser(
    phone,
    `✅ Done! Your scheduled message to ${schedule.recipient} has been cancelled.`
  );

  await setState(phone, 'MAIN_MENU');
  await replyToUser(phone, buildMainMenu(user.name ?? 'there'));
}
