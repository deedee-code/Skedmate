# Skedmate — End-to-End Testing Guide

This guide walks you through everything from a fresh clone to a scheduled message landing in someone else's WhatsApp inbox.

---

## Prerequisites

Before you start, make sure you have the following installed and running:

| Tool | Version | Notes |
|---|---|---|
| Node.js | 18+ | `node -v` to check |
| PostgreSQL | 14+ | Running locally or on a cloud host |
| Redis | 6+ | Running locally (`redis-server`) or via Docker |
| npm | 8+ | Comes with Node |

You will also need:
- Two real WhatsApp numbers (Phone A = the bot user, Phone B = the recipient)
- A HuggingFace API key (free at [huggingface.co](https://huggingface.co))
- A Cloudinary account (free tier) if you want to test media scheduling

---

## Step 1 — Clone and Install

```bash
git clone <your-repo-url>
cd skedmate
npm install
```

---

## Step 2 — Configure the Environment

```bash
cp .env.example .env
```

Open `.env` and fill in every value:

```env
PORT=3500
NODE_ENV=development

# Your local PostgreSQL connection string
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/skedmate

# Your local Redis URL
REDIS_URL=redis://localhost:6379

# How many messages one user can send per day (keep low while testing)
DAILY_MESSAGE_QUOTA=50

# HuggingFace — get a free key at https://huggingface.co/settings/tokens
HUGGINGFACE_API_KEY=hf_xxxxxxxxxxxxxxxxxxxx

# Cloudinary — only needed for media message tests
# Format: cloudinary://api_key:api_secret@cloud_name
CLOUDINARY_URL=cloudinary://123456789:abcdefghijk@mycloudname
```

---

## Step 3 — Set Up the Database

```bash
# Generate the Prisma TypeScript client
npm run db:generate

# Apply all migrations (creates tables: User, Schedule, Broadcast,
# ConversationState, WhatsAppSession)
npm run db:migrate
```

Verify the tables were created:

```bash
npm run db:studio
# Opens http://localhost:5555 — you should see all 5 tables
```

---

## Step 4 — Start the Server

```bash
npm run dev
```

You should see:

```
✅ Connected to the database successfully!
[SessionManager] Restoring 0 session(s)...
[Workers] Schedule and Broadcast workers started
🚀 Skedmate running at http://localhost:3500
📲 QR endpoint: POST http://localhost:3500/session/connect
```

**Keep this terminal open.** Open a second terminal for the next steps.

---

## Step 5 — Create a Test User

Skedmate needs a `User` record in the database before a session can be linked. Insert one manually:

```bash
# Open psql (adjust connection details as needed)
psql postgresql://postgres:yourpassword@localhost:5432/skedmate

# Insert a test user (use Phone A's number in E.164 format)
INSERT INTO "User" (id, phone, name, timezone)
VALUES (gen_random_uuid(), '+2348012345678', 'Test User', 'Africa/Lagos');

# Copy the generated UUID — you'll need it in the next step
SELECT id, phone FROM "User";
```

---

## Step 6 — Link Phone A via QR Code

Call the connect endpoint with the user's UUID:

```bash
curl -s -X POST http://localhost:3500/session/connect \
  -H "Content-Type: application/json" \
  -d '{"userId": "paste-uuid-here"}' | python -m json.tool
```

The response will look like:

```json
{
  "status": "awaiting_scan",
  "qr": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
}
```

### Render the QR code

Save the base64 value to an HTML file and open it in a browser:

```bash
# PowerShell — extract qr field and write to a file
$response = Invoke-RestMethod -Method POST -Uri "http://localhost:3500/session/connect" `
  -ContentType "application/json" `
  -Body '{"userId": "paste-uuid-here"}'

@"
<!DOCTYPE html>
<html><body style="display:flex;justify-content:center;padding:40px">
  <img src="$($response.qr)" style="width:300px;height:300px" />
</body></html>
"@ | Out-File -FilePath qr.html -Encoding utf8

Start-Process qr.html
```

### Scan with Phone A

1. Open WhatsApp on Phone A
2. Go to **Settings → Linked Devices → Link a Device**
3. Scan the QR code displayed in the browser

On success you will see in the server log:

```
[SessionManager] ✅ User <uuid> connected
```

Check session status anytime:

```bash
curl "http://localhost:3500/session/status?userId=paste-uuid-here"
# → { "userId": "...", "connected": true }
```

---

## Step 7 — Test the Conversation Flow

Phone A is now linked. Send a WhatsApp message **from Phone A to itself** (or to the linked number) and the bot will respond.

> In single-tenant mode the bot sends from Phone A's own account. So Phone A messages itself and the bot replies to it — this is expected behaviour.

### Onboarding

When you first send any message, Skedmate will introduce itself and ask for your name:

```
You send:  hi

Bot reply: Hey there! 👋 I'm Skedmate — your personal scheduling buddy...
           To get started, what's your name?

You send:  Tunde

Bot reply: Nice to meet you, Tunde! 🎉
           [Main menu appears]
```

### Main Menu

```
1️⃣  Schedule a text message
2️⃣  Schedule a file or media
3️⃣  Broadcast to multiple contacts
4️⃣  Set a recurring reminder
5️⃣  View scheduled messages
6️⃣  Cancel a scheduled message
7️⃣  Settings
```

---

## Step 8 — Schedule a Message to Phone B

This is the core test. We'll schedule a message to send to Phone B in 2 minutes.

```
You send:  1
Bot reply: Send your message now — text, file, image, or both together 👇

You send:  Hello from Skedmate! 👋 This is a scheduled test message.
Bot reply: Who should receive this? Send their WhatsApp number...

You send:  +2348087654321    ← Phone B's number in E.164 format
Bot reply: When should it be sent? 📅

You send:  in 2 minutes
Bot reply: ✅ Got it! I'll send your message to +2348087654321 on
           [date/time]. ID: a1b2c3d4 (save this if you want to cancel later)
```

### What to check in the database

```bash
psql postgresql://postgres:yourpassword@localhost:5432/skedmate \
  -c "SELECT id, recipient, \"sendAt\", status FROM \"Schedule\" ORDER BY \"createdAt\" DESC LIMIT 5;"
```

You should see a row with `status = pending`.

### What to check in Redis / BullMQ

The job is queued with a delay. You can inspect it:

```bash
# Install bull-board for a UI, or use redis-cli
redis-cli
> KEYS bull:skedmate-schedule:*
> HGETALL "bull:skedmate-schedule:1"
```

---

## Step 9 — Wait for the Message to Fire

After 2 minutes (plus the 4–12 second anti-ban delay), the worker fires the job.

**Phone B should receive** the message from Phone A's personal number — no sender identification as a bot.

**Phone A should receive** a confirmation:

```
✅ Your scheduled message to +2348087654321 has been sent!
```

### Verify in the database

```bash
psql ... -c "SELECT id, status FROM \"Schedule\" WHERE status = 'sent';"
```

The row should now show `status = sent`.

---

## Step 10 — Test Broadcast

```
You send:  3
Bot reply: Send the numbers you want to broadcast to...

You send:  +2348087654321, +2348099999999
Bot reply: Please confirm all recipients have agreed to receive messages...

You send:  YES
Bot reply: Now send your message...

You send:  This is a broadcast test 📣
Bot reply: Send now or schedule for later?

You send:  now
Bot reply: ✅ Broadcast queued for 2 contacts right now. 🚀
```

Each recipient gets an individual job in BullMQ. Because of the serial send rule, they fire one at a time with a 4–12 second gap between them.

---

## Step 11 — Test Cancel

```
You send:  5             ← View schedules
Bot reply: 📅 Your scheduled messages (1):
           1. ID: a1b2c3d4
              To: +2348087654321
              When: [time]

You send:  6             ← Cancel
Bot reply: Which message would you like to cancel?

You send:  a1b2c3d4
Bot reply: ✅ Done! Your scheduled message to +2348087654321 has been cancelled.
```

Verify in the DB: the row should show `status = cancelled`, and the BullMQ job should be gone.

---

## Step 12 — Test Quota Enforcement

To verify the daily quota is working, temporarily set `DAILY_MESSAGE_QUOTA=2` in `.env` and restart the server. Schedule 3 messages. The third should fail with:

```
⚠️ Your daily message quota (2) has been reached. Schedule ID xxxxxxxx was not sent.
```

The Schedule row will show `status = failed`. Reset quota to 50 when done.

---

## Step 13 — Test Session Persistence (Restart)

Stop the server (`Ctrl+C`) and start it again:

```bash
npm run dev
```

You should see:

```
[SessionManager] Restoring 1 session(s)...
[SessionManager] ✅ User <uuid> connected
```

Phone A's session is restored from PostgreSQL automatically — no re-scanning required.

---

## Step 14 — Test Logout

```bash
curl -X POST http://localhost:3500/session/logout \
  -H "Content-Type: application/json" \
  -d '{"userId": "paste-uuid-here"}'
# → { "status": "logged_out" }
```

The `WhatsAppSession` rows for this user are deleted. On the next server restart, this user will not be auto-reconnected and will need to scan a new QR.

---

## Troubleshooting

**QR times out (30 seconds)**
- Check that `DATABASE_URL` and `REDIS_URL` are correct and both services are running
- Make sure `npm run db:migrate` completed successfully

**"No active session for user"**
- The socket disconnected. Check the server logs for the disconnect reason
- Call `/session/connect` again to get a fresh QR and re-scan

**Message stuck as `pending` / job never fires**
- Confirm Redis is running: `redis-cli ping` should return `PONG`
- Check BullMQ worker logs in the server output

**Prisma errors on startup**
- Run `npm run db:generate` and `npm run db:migrate` again
- Verify `DATABASE_URL` in `.env` is correct

**"dailyMessageCount" column not found**
- The migration for the Baileys refactor hasn't run yet
- Run `npm run db:migrate` — it will apply the `baileys_session_and_quota` migration

---

## Quick Reference

```bash
# Check connected sessions
curl "http://localhost:3500/session/status?userId=<uuid>"

# View all pending schedules (psql)
SELECT id, recipient, "sendAt", status FROM "Schedule" WHERE status='pending';

# View stored session keys for a user
SELECT "keyType", "updatedAt" FROM "WhatsAppSession" WHERE "userId"='<uuid>';

# Manually reset a user's daily quota
UPDATE "User" SET "dailyMessageCount"=0 WHERE id='<uuid>';
```
