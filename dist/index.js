import 'dotenv/config'; // Load environment variables first
import express from 'express';
import webhookRouter from './routes/webhook.js';
import prisma from './db/prisma.js';
// Test database connection on startup
prisma.$connect()
    .then(() => {
    console.log('✅ Connected to the database successfully!');
})
    .catch((error) => {
    console.error('❌ Database connection failed:', error);
});
// Start BullMQ workers (import triggers worker registration)
import('./jobs/sendMessage.js').catch((err) => {
    console.error('[Workers] Failed to start workers:', err);
});
const app = express();
const PORT = process.env.PORT ?? 3500;
// Twilio sends form-encoded bodies
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
// Health check
app.get('/', (_req, res) => {
    res.json({ status: 'ok', service: 'Skedmate', timestamp: new Date().toISOString() });
});
// WhatsApp webhook
app.use('/webhook', webhookRouter);
app.listen(PORT, () => {
    console.log(`🚀 Skedmate running at http://localhost:${PORT}`);
    console.log(`📲 Webhook endpoint: http://localhost:${PORT}/webhook`);
});
export default app;
//# sourceMappingURL=index.js.map