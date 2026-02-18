# FlowBooks — Billing & Project Management

A self-hosted business management app for photography studios and creative agencies. Handles quoting, invoicing, project tracking, team management, and expense tracking.

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
- **Backup & Restore** — Multi-destination backups to AWS S3, Backblaze B2, or Google Drive (OAuth linking) with configurable schedules and retention policies.

## Prerequisites

- Node.js 24.x LTS (see `.nvmrc`)
- PostgreSQL 14+
- Redis (for BullMQ background jobs)
- Docker (for Redis container, or use a standalone Redis install)

## Quick Start (Development)

```bash
git clone https://github.com/sooknu/FlowBooks.git && cd FlowBooks
npm install
cp .env.example .env        # Edit with your database, auth, and service credentials
npm run db:push              # Create database tables
npm run dev                  # Start frontend + backend + open http://localhost:3000
```

In a separate terminal:

```bash
npm run dev:worker           # Start background job processor
```

## Fresh VPS Deployment

Deploy to a bare Ubuntu/Debian VPS (x86 or ARM64) in three steps:

```bash
# 1. Provision the server (as root)
git clone https://github.com/sooknu/FlowBooks.git && cd FlowBooks
sudo bash scripts/deploy.sh

# 2. Log out and back in (for docker group), then install the app
bash scripts/install.sh

# 3. Open browser to complete setup
# https://your-domain.com/setup
```

**`deploy.sh`** installs Node.js 24, PostgreSQL, Docker, Nginx, Certbot, pm2, UFW. Creates 2GB swap for low-memory VPS. Flushes restrictive iptables (Oracle Cloud). Idempotent — safe to re-run.

**`install.sh`** asks for domain name and SSL choice, then auto-generates everything else (DB credentials, Redis, `.env`, Nginx config). Three SSL options:
- **Certbot** — Let's Encrypt for direct servers
- **Cloudflare** — Auto-generates self-signed cert, set Cloudflare SSL to Full
- **Skip** — Configure later

**Setup wizard** (`/setup`) lets you create an admin account or restore from a cloud backup (S3, Backblaze B2, or Google Drive).

Tested on: Ubuntu 22.04/24.04, Debian 11+, AWS free tier (t2.micro), Oracle Cloud free tier (ARM64).

## Commands

### Development

| Command | Description |
|---------|-------------|
| `npm run dev` | Start frontend (Vite :3000) + backend (Fastify) with hot reload |
| `npm run dev:client` | Frontend only |
| `npm run dev:server` | Backend only (tsx watch) |
| `npm run dev:worker` | Background worker (tsx watch) |
| `npm run db:studio` | Open Drizzle Studio GUI |

### Production (pm2)

The app runs two pm2 processes — a Fastify server and a BullMQ worker.

| Command | Description |
|---------|-------------|
| `pm2 start ecosystem.config.cjs` | **Start** the full stack (server + worker) |
| `pm2 stop all` | **Stop** the full stack |
| `pm2 restart all` | **Restart** the full stack |
| `pm2 logs` | Tail live logs from both processes |
| `pm2 status` | Check if processes are running |

### Build & Deploy

| Command | Description |
|---------|-------------|
| `npm run build` | Build frontend for production |
| `npm run db:push` | Sync Drizzle schema to database |
| `npm run db:migrate` | Run Drizzle migrations |
| `npm run db:generate` | Generate migration files |
| `npm run restore` | Restore from a cloud backup (interactive CLI) |

### Typical deploy after code changes

```bash
git pull
npm install                  # If dependencies changed
npm run db:push              # If schema changed
npm run build                # Rebuild frontend
pm2 restart all              # Restart server + worker
```

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
│   ├── install.sh        # App installation (DB, Redis, .env, SSL)
│   └── restore.js        # Interactive backup restore CLI
├── ecosystem.config.cjs  # pm2 config
├── drizzle.config.ts     # Drizzle ORM config
└── vite.config.js        # Vite + proxy config
```

## Environment Variables

See [`.env.example`](.env.example) for all required and optional variables.

## License

MIT
