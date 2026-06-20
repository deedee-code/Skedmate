import prisma from '../db/prisma.js';
import { Prisma } from '@prisma/client';

export type ConversationStateValue =
  | 'AWAITING_NAME'
  | 'AWAITING_TIMEZONE'
  | 'MAIN_MENU'
  | 'AWAITING_CONTENT'
  | 'AWAITING_RECIPIENT'
  | 'AWAITING_TIME'
  | 'AWAITING_RECURRENCE'
  | 'AWAITING_CUSTOM_RECURRENCE'
  | 'AWAITING_BROADCAST_NUMBERS'
  | 'AWAITING_BROADCAST_CONTENT'
  | 'AWAITING_BROADCAST_TIME'
  | 'AWAITING_BROADCAST_CONFIRM'
  | 'AWAITING_CANCEL_ID'
  | 'AWAITING_SETTINGS_CHOICE'
  | 'AWAITING_NEW_TIMEZONE';

export type ConversationContext = Record<string, unknown>;

/**
 * Get the current conversation state for a phone number.
 * Returns null if no state exists.
 */
export async function getState(
  phone: string
): Promise<{ state: ConversationStateValue; context: ConversationContext } | null> {
  const record = await prisma.conversationState.findUnique({ where: { phone } });
  if (!record) return null;
  return {
    state: record.state as ConversationStateValue,
    context: (record.context as ConversationContext) ?? {},
  };
}

/**
 * Set or update the conversation state for a phone number.
 * If context is not provided, the existing context is preserved.
 */
export async function setState(
  phone: string,
  state: ConversationStateValue,
  context?: ConversationContext
): Promise<void> {
  const updateData: any = { state };
  if (context !== undefined) {
    updateData.context = context as Prisma.InputJsonValue;
  }

  await prisma.conversationState.upsert({
    where: { phone },
    update: updateData,
    create: { phone, state, context: (context ?? {}) as Prisma.InputJsonValue },
  });
}

/**
 * Update only the context without changing the state.
 */
export async function updateContext(
  phone: string,
  partialContext: ConversationContext
): Promise<void> {
  const existing = await prisma.conversationState.findUnique({ where: { phone } });
  const merged = { ...((existing?.context as ConversationContext) ?? {}), ...partialContext };
  await prisma.conversationState.update({
    where: { phone },
    data: { context: merged as Prisma.InputJsonValue },
  });
}

/**
 * Clear the conversation state (e.g. after completing a flow).
 */
export async function clearState(phone: string): Promise<void> {
  await prisma.conversationState.deleteMany({ where: { phone } });
}
