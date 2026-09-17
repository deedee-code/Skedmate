import 'dotenv/config';
import express from 'express';
// Optionally silence noisy trace logs from dependencies (e.g., Baileys)
if (process.env.SILENCE_BAILEYS_TRACE === 'true') {
  // Override console.trace early so downstream libs don't print stack traces
  // Use a no-op to avoid cluttering the terminal during development.
  // Set env: `SILENCE_BAILEYS_TRACE=true` when starting the server.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (console as any).trace = () => {};
}
import prisma from './db/prisma.js';
import { restoreAllSessions } from './services/sessionManager.js';
import qrRouter from './routes/qr.js';
import messagesRouter from './routes/messages.js';
import devRouter from './routes/dev.js';

// Test database connection on startup
prisma.$connect()
  .then(async () => {
    console.log('✅ Connected to the database successfully!');
    // Restore any previously authenticated Baileys sessions from the DB
    await restoreAllSessions();
  })
  .catch((error: unknown) => {
    console.error('❌ Database connection failed:', error);
  });

// Start BullMQ workers (import triggers worker registration)
import('./jobs/sendMessage.js').catch((err) => {
  console.error('[Workers] Failed to start workers:', err);
});

const app = express();
const PORT = process.env.PORT ?? 3500;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Health check
app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'Skedmate', timestamp: new Date().toISOString() });
});

// WhatsApp session management (QR, logout, status)
app.use('/session', qrRouter);
// Message sending via server session
app.use('/messages', messagesRouter);
// Dev-only helpers (disabled unless ALLOW_DEV_ENDPOINTS=true)
app.use('/dev', devRouter);

app.listen(PORT, () => {
  console.log(`🚀 Skedmate running at http://localhost:${PORT}`);
  console.log(`📲 QR endpoint: POST http://localhost:${PORT}/session/connect`);
});

export default app;
