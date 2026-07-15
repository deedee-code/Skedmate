# Skedmate 🗓️

> Your buddy that sends, so you don't have to.

A multi-tenant WhatsApp scheduling bot built with Node.js, TypeScript, Baileys, BullMQ, and PostgreSQL. Users link their **personal** WhatsApp accounts via QR code and schedule messages to be sent on their behalf — no Business API, no template approvals, no opt-in requirements.

---

## Features

- 📝 Schedule text messages to any WhatsApp number
- 📎 Schedule files, images & media (via Cloudinary)
- 📣 Broadcast to multiple contacts at once
- 🔁 Set recurring reminders (daily / weekly / monthly / custom)
- 📅 View your scheduled messages
- ❌ Cancel a scheduled message
- ⚙️ Manage timezone settings
- 🤖 Natural language time parsing ("tomorrow 9am", "next Friday at 3pm")
- 💬 AI fallback via HuggingFace for unrecognised messages
- 🔒 Per-user daily send quota (default: 50 messages/day) to protect accounts
- ⏱️ 4–12 second random delay between sends to mimic human behaviour

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ (ESM) |
| Language | TypeScript |
| Framework | Express.js |
| Database | PostgreSQL via Prisma ORM v7 |
| WhatsApp | Baileys (`@whiskeysockets/baileys`) — WebSocket, no headless browser |
| Job Queue | BullMQ (Redis-backed) |
| Cache / Buffer | ioredis |
| File Storage | Cloudinary |
| NLP / Time | chrono-node |
| AI Layer | HuggingFace Inference API |

---

## How It Works

```
User's Phone
     │
     │  scans QR once
     ▼
Baileys WebSocket ──► Session Manager (in-process Map)
     │                      │
     │  incoming message     │  auth state persisted to
     ▼                      ▼
  Buffer (Redis)       PostgreSQL (WhatsAppSession table)
     │
     ▼
Message Controller ──► Handler (onboarding / schedule / broadcast …)
                            │
                            ▼
                       BullMQ Queue ──► Worker (fires at scheduled time)
                                            │
                                            ▼
                                    Baileys socket.sendMessage()
                                    (serial, 4–12s random delay, quota check)
```

Each user's Baileys socket is ~15 MB RAM. Auth credentials are stored in PostgreSQL so sessions survive server restarts automatically.

---

## Prerequisites

- Node.js 18+
- PostgreSQL database
- Redis server
- HuggingFace API key (free tier is fine for MVP)
- Cloudinary account (for media scheduling)

---

## Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd skedmate
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in `.env`:

```env
PORT=3500
NODE_ENV=development

DATABASE_URL=postgresql://user:password@localhost:5432/skedmate
REDIS_URL=redis://localhost:6379

# Max messages a user can send per day (protects their account)
DAILY_MESSAGE_QUOTA=50

HUGGINGFACE_API_KEY=your_key_here
CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name
```

### 3. Set up the database

```bash
# Generate the Prisma client
npm run db:generate

# Run migrations (creates all tables including WhatsAppSession)
npm run db:migrate
```

### 4. Start the server

```bash
npm run dev
```

### 5. Link a WhatsApp account

Once the server is running, call the connect endpoint for a user:

```bash
curl -X POST http://localhost:3500/session/connect \
  -H "Content-Type: application/json" \
  -d '{"userId": "<user-uuid-from-db>"}'
```

The response contains a `qr` field — a base64 PNG data-URL. Render it in a browser or save to a file and scan it with the WhatsApp app on your phone.

---

## Session API

| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/session/connect` | `{ "userId": "..." }` | Start session, returns QR code |
| POST | `/session/logout` | `{ "userId": "..." }` | Log out and wipe credentials |
| GET | `/session/status` | `?userId=...` | Check if socket is live |

---

## Project Structure

```
skedmate/
├── src/
│   ├── index.ts                      # Express app + session restore on startup
│   ├── routes/
│   │   └── qr.ts                     # Session management endpoints (connect/logout/status)
│   ├── controllers/
│   │   └── messageController.ts      # Routes inbound messages to the right handler
│   ├── handlers/
│   │   ├── onboarding.ts             # New user intro + name collection
│   │   ├── mainMenu.ts               # Main menu display and routing
│   │   ├── scheduleText.ts           # Schedule text/media message flow
│   │   ├── broadcast.ts              # Broadcast to multiple contacts flow
│   │   ├── recurring.ts              # Recurring reminder flow
│   │   ├── viewSchedules.ts          # List scheduled items
│   │   ├── cancelSchedule.ts         # Cancel a scheduled item
│   │   └── settings.ts               # Timezone and preferences
│   ├── services/
│   │   ├── baileyAuthState.ts        # PostgreSQL-backed Baileys auth state
│   │   ├── sessionManager.ts         # Multi-tenant WASocket manager
│   │   ├── whatsapp.ts               # Send helpers + daily quota enforcement
│   │   ├── scheduler.ts              # BullMQ queue setup and job dispatch
│   │   ├── buffer.ts                 # Redis message buffer (groups text + media)
│   │   ├── storage.ts                # Cloudinary upload handler
│   │   ├── huggingface.ts            # HuggingFace NLP handler
│   │   ├── timeParser.ts             # chrono-node natural language time parsing
│   │   └── redis.ts                  # Shared ioredis client
│   ├── db/
│   │   └── prisma.ts                 # Prisma client singleton (with pg adapter)
│   ├── jobs/
│   │   └── sendMessage.ts            # BullMQ workers — serial sends with anti-ban delays
│   └── utils/
│       ├── stateManager.ts           # Read/write ConversationState in DB
│       └── formatter.ts              # Message formatting helpers
├── prisma/
│   └── schema.prisma                 # Database schema
├── prisma.config.ts                  # Prisma v7 config
├── .env.example
├── package.json
├── TESTING.md                        # End-to-end testing guide
└── README.md
```

---

## Anti-Ban Rules

These are enforced automatically and cannot be bypassed:

1. **Serial sends only** — `Promise.all()` is never used for outgoing messages
2. **Random human delay** — 4 to 12 seconds between every outgoing message per user
3. **Daily quota** — each user is capped at `DAILY_MESSAGE_QUOTA` sends per day (default 50); the counter resets at midnight UTC

---

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Run compiled production build |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Run database migrations |
| `npm run db:push` | Push schema changes without a migration file |
| `npm run db:studio` | Open Prisma Studio (visual DB browser) |

---

## Notes

- Baileys uses WebSockets — no Puppeteer/Chrome, ~15 MB RAM per user session
- Auth credentials are stored in PostgreSQL (`WhatsAppSession` table), so sessions survive server restarts
- This uses the unofficial WhatsApp Web protocol. Use responsibly and keep send volumes low
- HuggingFace free tier is rate-limited; it's only called for unrecognised freeform messages
