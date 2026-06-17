# Skedmate 🗓️

> Your buddy that sends, so you don't have to.

A WhatsApp scheduling bot built with Node.js, TypeScript, Twilio, BullMQ, and PostgreSQL.

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
- 💬 AI fallback via HuggingFace Mistral 7B for unrecognised messages

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ESM) |
| Language | TypeScript |
| Framework | Express.js |
| Database | PostgreSQL via Prisma ORM v7 |
| WhatsApp | Twilio WhatsApp API |
| Job Queue | BullMQ (Redis-backed) |
| Cache/Buffer | ioredis |
| File Storage | Cloudinary |
| NLP / Time | chrono-node |
| AI Layer | HuggingFace Mistral 7B |

---

## Prerequisites

- Node.js 18+
- PostgreSQL database
- Redis server
- Twilio account with WhatsApp Sandbox (or production number)
- HuggingFace API key
- Cloudinary account

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env` and fill in your credentials:

```env
PORT=3500
NODE_ENV=development

DATABASE_URL=postgresql://user:password@localhost:5432/skedmate
REDIS_URL=redis://localhost:6379

TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_NUMBER=+14155238886

HUGGINGFACE_API_KEY=your_huggingface_api_key

CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name
```

### 3. Set up the database

```bash
# Generate Prisma client
npm run db:generate

# Run migrations (creates tables)
npm run db:migrate
```

### 4. Start the development server

```bash
npm run dev
```

### 5. Expose your local server (for Twilio webhook)

Use [ngrok](https://ngrok.com/) or similar:

```bash
ngrok http 3500
```

Then set your Twilio WhatsApp webhook URL to:
```
https://your-ngrok-url.ngrok.io/webhook
```

---

## Twilio Sandbox Setup

1. Go to [Twilio Console](https://console.twilio.com) → Messaging → Try it out → Send a WhatsApp message
2. Set webhook URL: `https://your-domain.com/webhook`
3. Users join the sandbox by texting your join code to the sandbox number
4. Switch to a registered production number when going live

---

## Project Structure

```
skedmate/
├── src/
│   ├── index.ts                  # Express app entry point
│   ├── routes/
│   │   └── webhook.ts            # POST /webhook — receives WhatsApp events
│   ├── controllers/
│   │   └── messageController.ts  # Routes incoming messages to the right handler
│   ├── handlers/
│   │   ├── onboarding.ts         # New user intro + name collection
│   │   ├── mainMenu.ts           # Main menu display and routing
│   │   ├── scheduleText.ts       # Schedule text/media message flow
│   │   ├── broadcast.ts          # Broadcast to multiple contacts flow
│   │   ├── recurring.ts          # Recurring reminder flow
│   │   ├── viewSchedules.ts      # List scheduled items
│   │   ├── cancelSchedule.ts     # Cancel a scheduled item
│   │   └── settings.ts           # Timezone and preferences
│   ├── services/
│   │   ├── whatsapp.ts           # Twilio WhatsApp API wrapper
│   │   ├── scheduler.ts          # BullMQ queue setup and dispatch
│   │   ├── buffer.ts             # Redis message buffer (groups text + media)
│   │   ├── storage.ts            # Cloudinary upload handler
│   │   ├── huggingface.ts        # HuggingFace Mistral 7B NLP handler
│   │   ├── timeParser.ts         # chrono-node natural language time parsing
│   │   └── redis.ts              # Shared ioredis client
│   ├── db/
│   │   └── prisma.ts             # Prisma client instance (with pg adapter)
│   ├── jobs/
│   │   └── sendMessage.ts        # BullMQ workers — executes scheduled sends
│   └── utils/
│       ├── stateManager.ts       # Read/write ConversationState in DB
│       └── formatter.ts          # Message formatting helpers
├── prisma/
│   └── schema.prisma             # Database schema
├── prisma.config.ts              # Prisma v7 config (datasource URL)
├── .env
├── package.json
└── README.md
```

---

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Run compiled production build |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Run database migrations |
| `npm run db:push` | Push schema changes without migration |
| `npm run db:studio` | Open Prisma Studio |

---

## HuggingFace Notes

- The free Serverless Inference API is rate-limited — suitable for MVP
- Upgrade to HuggingFace PRO ($9/month) for higher limits as usage grows
- Mistral 7B is only called for unrecognised/freeform messages — menu flows bypass it entirely
