#!/usr/bin/env -S tsx
import 'dotenv/config';
import prisma from '../src/db/prisma.js';
import { sendText } from '../src/services/whatsapp.js';

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: tsx scripts/send-self.ts <phone> <message...>');
    console.error('Example: tsx scripts/send-self.ts +15551234567 "Hello me!"');
    process.exit(2);
  }

  const phone = args[0];
  const message = args.slice(1).join(' ');

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    console.error(`No user found for phone ${phone}. Make sure the phone is registered.`);
    process.exit(1);
  }

  try {
    await sendText(user.id, phone, message);
    console.log('Message queued/sent successfully');
  } catch (err: any) {
    console.error('Failed to send message:', err?.message ?? err);
    process.exit(1);
  }

  process.exit(0);
}

main();
