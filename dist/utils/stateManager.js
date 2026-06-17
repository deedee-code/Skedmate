import prisma from '../db/prisma.js';
/**
 * Get the current conversation state for a phone number.
 * Returns null if no state exists.
 */
export async function getState(phone) {
    const record = await prisma.conversationState.findUnique({ where: { phone } });
    if (!record)
        return null;
    return {
        state: record.state,
        context: record.context ?? {},
    };
}
/**
 * Set or update the conversation state for a phone number.
 */
export async function setState(phone, state, context = {}) {
    await prisma.conversationState.upsert({
        where: { phone },
        update: { state, context: context },
        create: { phone, state, context: context },
    });
}
/**
 * Update only the context without changing the state.
 */
export async function updateContext(phone, partialContext) {
    const existing = await prisma.conversationState.findUnique({ where: { phone } });
    const merged = { ...(existing?.context ?? {}), ...partialContext };
    await prisma.conversationState.update({
        where: { phone },
        data: { context: merged },
    });
}
/**
 * Clear the conversation state (e.g. after completing a flow).
 */
export async function clearState(phone) {
    await prisma.conversationState.deleteMany({ where: { phone } });
}
//# sourceMappingURL=stateManager.js.map