#!/usr/bin/env -S tsx
import 'dotenv/config';
import prisma from '../src/db/prisma.js';

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: tsx scripts/check-user.ts <phone>');
    process.exit(2);
  }

  const phone = args[0];
  const variants = [phone, phone.startsWith('+') ? phone.replace('+', '') : `+${phone}`];

  for (const p of variants) {
    const user = await prisma.user.findUnique({ where: { phone: p } });
    console.log(`lookup ${p}: ${user ? 'FOUND -> ' + user.id : 'NOT FOUND'}`);
  }

  // Also try without non-digits
  const stripped = phone.replace(/\D/g, '');
  const plusStripped = `+${stripped}`;
  const plain = stripped;

  for (const p of [plusStripped, plain]) {
    const user = await prisma.user.findUnique({ where: { phone: p } });
    console.log(`lookup ${p}: ${user ? 'FOUND -> ' + user.id : 'NOT FOUND'}`);
  }

  process.exit(0);
}

main();
