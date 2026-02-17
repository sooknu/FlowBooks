# Madrid Photography — Billing & Project Management

A self-hosted business management app for photography studios. Handles quoting, invoicing, project tracking, team management, and expense tracking.

## Stack

- **Frontend:** React 18, Vite 4, Tailwind CSS, Radix UI, Framer Motion
- **Backend:** Fastify 5, Drizzle ORM, PostgreSQL (postgres.js), TypeScript (tsx)
- **Auth:** Better Auth (email/password, Google OAuth, OIDC, passkeys)
- **Background Jobs:** BullMQ + Redis
- **Payments:** Stripe, PayPal
- **PDF:** pdf-lib (server-side generation)
- **Email:** Nodemailer (SMTP)

## Features

- **Quotes & Invoices** — Create, send, and track quotes with one-click approval that converts to invoices. Online payment via Stripe/PayPal.
- **Projects** — Full lifecycle tracking (lead → booked → shooting → editing → delivered → completed → archived) with linked quotes, invoices, expenses, and team assignments.
- **Team Management** — Role-based system (owner, manager, lead, crew) with granular permissions, project assignments, payments, salary tracking, and crew self-service dashboard.
- **Expenses** — Category-based expense tracking with recurring subscriptions, auto-generated entries, and team payment sync.
- **Clients** — Client profiles with contact info, linked quotes/invoices/projects, and credit management.
- **Permissions** — 21 granular permission keys across 7 groups with customizable per-role defaults and per-user overrides.
- **Notifications** — In-app notification bell with browser push support.
- **Calendar** — Project calendar view.
- **Reports** — Dashboard with stats, revenue tracking, and expense breakdowns.
- **Backup & Restore** — Automated database backups to AWS S3, Backblaze B2, or Google Drive with configurable schedules (daily/weekly/manual) and retention policies.

## Prerequisites

- Node.js 20.x (see `.nvmrc`)
- PostgreSQL 14+
- Redis (for BullMQ background jobs)

## Setup

```bash
# Install dependencies
npm install

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your database, auth, and service credentials

# Push database schema
npm run db:push

# Start development (frontend + backend)
npm run dev
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start frontend (Vite) + backend (Fastify) concurrently |
| `npm run dev:client` | Frontend only |
| `npm run dev:server` | Backend only (tsx watch) |
| `npm run dev:worker` | Background worker (tsx watch) |
| `npm run build` | Production build |
| `npm start` | Production server |
| `npm run start:worker` | Production worker |
| `npm run db:push` | Sync Drizzle schema to database |
| `npm run db:migrate` | Run Drizzle migrations |
| `npm run db:generate` | Generate migration files |
| `npm run db:studio` | Open Drizzle Studio GUI |

## Fresh VPS Deployment

Deploy to a bare Ubuntu VPS in three steps:

```bash
git clone git@github.com:sooknu/madrid-photo.git && cd madrid-photo
sudo bash scripts/deploy.sh       # Install Node.js, PostgreSQL, Docker, Nginx, pm2, Certbot, UFW
bash scripts/install.sh            # Create DB, Redis, .env, Nginx config, SSL, start app
# Open https://your-domain.com/setup in browser to create admin account
```

`deploy.sh` is idempotent — safe to re-run. `install.sh` auto-generates all credentials and only asks for the domain name.

## Production Deployment

Uses pm2 to run both the server and background worker:

```bash
npm run build
pm2 start ecosystem.config.cjs
```

This starts two processes:
- `madrid-quotes` — Fastify server (serves API + built frontend)
- `madrid-worker` — BullMQ worker (email sending, invoice reminders, recurring expenses, backup jobs, cleanup)

## Project Structure

```
├── server/
│   ├── index.ts          # Fastify entry point
│   ├── auth.ts           # Better Auth config
│   ├── worker.ts         # BullMQ worker entry
│   ├── db/
│   │   ├── schema.ts     # Drizzle ORM schema
│   │   └── index.ts      # DB connection
│   ├── lib/              # Shared utilities
│   ├── routes/           # API route handlers
│   └── workers/          # Background job processors
├── src/
│   ├── main.jsx          # React entry point
│   ├── App.jsx           # Routes & lazy loading
│   ├── components/       # All view components
│   │   └── ui/           # Radix-based UI primitives
│   ├── contexts/         # Auth context
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # API client, utils, constants
│   └── index.css         # Tailwind + custom styles
├── scripts/
│   ├── deploy.sh         # VPS provisioning (Node, PG, Docker, Nginx)
│   └── install.sh        # App installation (DB, Redis, .env, SSL)
├── ecosystem.config.cjs  # pm2 config
├── drizzle.config.ts     # Drizzle ORM config
└── vite.config.js        # Vite + proxy config
```

## Environment Variables

See [`.env.example`](.env.example) for all required and optional variables.

## License

Private — All rights reserved.
