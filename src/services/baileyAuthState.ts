/**
 * baileyAuthState.ts
 *
 * A PostgreSQL-backed replacement for Baileys' useMultiFileAuthState.
 * Instead of writing JSON files to disk, every auth key is stored as a row
 * in the WhatsAppSession table, keyed by (userId, keyType).
 *
 * Drop-in replacement: returns the same { state, saveCreds } shape that
 * makeWASocket expects.
 */

import {
  AuthenticationCreds,
  AuthenticationState,
  BufferJSON,
  initAuthCreds,
  proto,
  SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import prisma from '../db/prisma.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Serialise a value to a plain JSON-safe object, handling Buffers via BufferJSON. */
function serialise(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, BufferJSON.replacer));
}

/** Deserialise a stored JSON value back to the original type. */
function deserialise<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value), BufferJSON.reviver) as T;
}

// ─── Key store ───────────────────────────────────────────────────────────────

/**
 * Build a Baileys-compatible key store backed by Postgres.
 * Baileys calls get/set on this object for pre-keys, sender-keys, etc.
 */
function buildKeyStore(userId: string) {
  return {
    async get<T extends keyof SignalDataTypeMap>(
      type: T,
      ids: string[]
    ): Promise<{ [id: string]: SignalDataTypeMap[T] }> {
      const result: { [id: string]: SignalDataTypeMap[T] } = {};

      await Promise.all(
        ids.map(async (id) => {
          const keyType = `${type}:${id}`;
          const row = await prisma.whatsAppSession.findUnique({
            where: { userId_keyType: { userId, keyType } },
          });
          if (row?.data) {
            result[id] = deserialise<SignalDataTypeMap[T]>(row.data);
          }
        })
      );

      return result;
    },

    async set<T extends keyof SignalDataTypeMap>(
      data: { [T in keyof SignalDataTypeMap]?: { [id: string]: SignalDataTypeMap[T] } }
    ): Promise<void> {
      const writes: Promise<unknown>[] = [];

      for (const type of Object.keys(data) as (keyof SignalDataTypeMap)[]) {
        const entries = data[type];
        if (!entries) continue;

        for (const [id, value] of Object.entries(entries)) {
          const keyType = `${type}:${id}`;

          if (value) {
            writes.push(
              prisma.whatsAppSession.upsert({
                where: { userId_keyType: { userId, keyType } },
                update: { data: serialise(value) as any },
                create: { userId, keyType, data: serialise(value) as any },
              })
            );
          } else {
            // null value means delete
            writes.push(
              prisma.whatsAppSession
                .delete({ where: { userId_keyType: { userId, keyType } } })
                .catch(() => {}) // ignore not-found
            );
          }
        }
      }

      await Promise.all(writes);
    },
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Creates a Baileys auth state backed by PostgreSQL.
 *
 * @param userId - The internal User.id (UUID) whose credentials to load/save.
 * @returns { state, saveCreds } — same shape as useMultiFileAuthState.
 */
export async function usePostgresAuthState(userId: string): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  // Load or initialise the main credentials object
  const credsRow = await prisma.whatsAppSession.findUnique({
    where: { userId_keyType: { userId, keyType: 'creds' } },
  });

  const creds: AuthenticationCreds = credsRow?.data
    ? deserialise<AuthenticationCreds>(credsRow.data)
    : initAuthCreds();

  const keys = buildKeyStore(userId);

  const state: AuthenticationState = { creds, keys };

  async function saveCreds(): Promise<void> {
    await prisma.whatsAppSession.upsert({
      where: { userId_keyType: { userId, keyType: 'creds' } },
      update: { data: serialise(state.creds) as any },
      create: { userId, keyType: 'creds', data: serialise(state.creds) as any },
    });
  }

  return { state, saveCreds };
}

/**
 * Delete all auth rows for a user (i.e., log them out / clear session).
 */
export async function deleteAuthState(userId: string): Promise<void> {
  await prisma.whatsAppSession.deleteMany({ where: { userId } });
}
