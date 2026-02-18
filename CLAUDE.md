# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FlowBooks is a self-hosted business management app for photography studios and creative agencies. Handles quoting, invoicing, project tracking, team management, expense tracking, and more. Fastify + Drizzle ORM + PostgreSQL backend with Better Auth for authentication. React + Vite frontend with a Notion-style light UI theme and sidebar navigation. Server files are TypeScript, run via tsx.

## Commands

- **Dev (full stack):** `npm run dev` — starts both Vite (port 3000) and Fastify (port 3002) via concurrently. Backend port is 3002 (Vite proxies `/api` and `/uploads` to it)
- **Dev (client only):** `npm run dev:client`
- **Dev (server only):** `npm run dev:server`
- **Dev worker:** `npm run dev:worker` — runs BullMQ worker in tsx watch mode
- **Start (production):** `npm start` — runs `tsx --env-file=.env server/index.ts`
- **Start worker:** `npm run start:worker` — runs BullMQ worker process
- **Build:** `npm run build` (runs `tools/generate-llms.js` then `vite build`)
- **Preview:** `npm run preview` (serves built output on port 3000)
- **Lint:** `npx eslint .`
- **DB push:** `npm run db:push` — sync Drizzle schema to database
- **DB migrate:** `npm run db:migrate` — run Drizzle migrations
- **DB studio:** `npm run db:studio` — Drizzle Studio GUI
- **DB generate:** `npm run db:generate` — generate Drizzle migration files
- **Restore:** `npm run restore` — interactive CLI backup restore (S3/B2/Google Drive)
- **Node version:** 24.x LTS (see `.nvmrc`)

No test framework is configured.

## Architecture

### Tech Stack
- **Frontend:** React 18, Vite 4, Tailwind CSS 3, React Router 7, PostCSS/Autoprefixer
- **Backend:** Fastify 5, Drizzle ORM (PostgreSQL via postgres.js), Better Auth, TypeScript (tsx)
- **Auth:** Better Auth with email/password, Google OAuth, OIDC, passkeys (WebAuthn)
- **UI:** Radix UI primitives (`@radix-ui/react-*`) wrapped in `src/components/ui/`
- **Background Jobs:** BullMQ + Redis (ioredis)
- **Payments:** Stripe, PayPal
- **Other:** Framer Motion for animations, Lucide for icons, pdf-lib for PDF generation, nodemailer for email

### Path Alias
`@` maps to `./src` (configured in `vite.config.js` and `eslint.config.mjs`). Always use `@/` imports.

### Frontend Structure

**Entry:** `src/main.jsx` → renders `<ErrorBoundary>` → `<QueryClientProvider>` → `<AuthProvider>` → `<BrowserRouter>` → `<App />` + `<Toaster />`. Also sets up global error capture: `reportError()` (POSTs to `/api/errors` with 30s dedup), `window.onerror`, `window.onunhandledrejection`, and `ErrorBoundary.componentDidCatch`.

**Routing:** React Router (`react-router-dom`) with `BrowserRouter`. `App.jsx` defines `<Routes>` with nested layout routes. Navigation uses `useNavigate()` hook.

**Layout:** Sidebar navigation (`Sidebar.jsx`) + content area (`AppLayout.jsx`). Auth boundary via `AuthGuard.jsx` (shows LoginPage or PendingApprovalPage when not authenticated). Admin routes protected by `AdminGuard.jsx`.

**Route structure:**
- `/` → redirects to `/dashboard`
- `/dashboard` — stats overview
- `/quotes`, `/invoices`, `/clients`, `/clients/:id` — billing & client views
- `/projects`, `/projects/:id` — project management with detail view
- `/calendar` — project calendar with month/week views
- `/expenses` — expense tracking with categories, vendors, recurring expenses
- `/team` — team member management with roles
- `/finance` — team payment tracking (advances, repayments)
- `/salary` — salary accrual and payment ledger
- `/services` — ProductsManager (services/products CRUD)
- `/settings` → `SettingsLayout.jsx` with sub-routes: `/settings/general`, `/settings/payments`, `/settings/email`, `/settings/permissions`, `/settings/activity`, `/settings/categories`, `/settings/backup`
- `/approve/:token`, `/pay/:token`, `/verified` — public routes (no auth/sidebar)
- `/payments`, `/contracts`, `/reports` — ComingSoon placeholders

**Data flow:** On-demand loading via TanStack React Query. `useAppData()` hook loads `settings` and `profile` on auth. Each view fetches its own data:
- **Dashboard** — `GET /api/stats/dashboard` (SQL aggregates, no full records)
- **List views** (Clients, Quotes, Invoices, Projects, Expenses) — own `useInfiniteQuery` with server-side pagination
- **Editors** (QuoteEditor, InvoiceEditor) — `useClientsCatalog()` + `useProductsCatalog()` (5-min staleTime, loaded on-demand when editor mounts)
- **Settings** — `useSettings()` hook in `SettingsLayout`, passes to children via sub-routes
- No global state library. Navigation state passed via `useNavigate(path, { state })` + `useLocation().state`. **Important:** Clear nav state with `window.history.replaceState({}, '', path)` — NOT `navigate(path, { state: null })` which causes React Router remount and resets `useState`.

**API client:** `src/lib/apiClient.js` — thin fetch wrapper (`api.get()`, `api.post()`, `api.put()`, `api.delete()`, `api.upload()`) using `credentials: 'include'` for session cookies.

**Auth client:** `src/lib/authClient.js` — Better Auth React client (`createAuthClient`).

**Auth context:** `src/contexts/AuthContext.jsx` provides `useAuth()` hook (user, session, loading, signIn, signUp, signOut).

**Views (in `src/components/`):**
- `Dashboard` — stats overview (uses dedicated `/api/stats/dashboard` endpoint)
- `QuotesManager` — quote CRUD, includes `QuoteEditor`/`QuoteBuilder` sub-views
- `InvoicesManager` — invoice management
- `ClientsManager` — client CRUD
- `ClientProfile` — single client detail view (accessed via `/clients/:id`)
- `ProjectsManager` — project CRUD with status filtering, search, sorting, archive/restore
- `ProjectDetail` — project detail with tabs: overview, assignments, financials, notes, documents. Includes project locking, team assignment tracking, and financial summaries
- `CalendarView` — month/week calendar with project shoot dates, team member filtering, status color coding
- `ExpensesManager` — expense CRUD with category/project/date filtering, recurring expenses, monthly breakdown
- `TeamManager` — team member CRUD with role assignment, user account linking, advances/salary toggles
- `FinanceManager` — team payment tracking with status filters, project/member filters, advance repayment
- `SalaryManager` — salary accrual/payment ledger with period-based tracking and balance calculation
- `BackupManager` — multi-destination backup management (S3, B2, Google Drive) with scheduling, history, and restore
- `SettingsLayout` — settings shell with sub-tabs: `BrandingManager`, `PaymentGatewayManager`, `EmailManager`, `PermissionsManager`, `ActivityLogViewer`, `CategoriesSettings`, `BackupManager`
- `ProductsManager` — services/products CRUD (at `/services`)
- `ProfileManager` — user profile and password management
- `UsersManager` — admin user management

### Backend Structure (`server/`)

**Entry:** `server/index.ts` — Fastify with CORS, multipart, static file serving, auth middleware, Better Auth handler. Middleware order matters: CORS → cookie signing → multipart (10MB limit) → static files → `/uploads/documents/` blocking (403) → auth extraction hook → Better Auth handler → app routes → SPA fallback (production).

**Auth middleware:** The auth hook populates `request.user`, `request.session`, `request.userRole`, and `request.permissions`. It skips: `/api/auth/*`, `/api/oidc/*`, `/api/google/*`, `/api/settings/public`, `/api/users/check-verification`, `/uploads/*`, `/api/pdf/download/:token`, `/api/pay/*`, `/api/approve/*`.

**Auth:** `server/auth.ts` — Better Auth config with Drizzle adapter, email/password, Google OAuth, passkeys (WebAuthn), admin plugin. Custom OIDC flow via `server/routes/oidc.ts` and `server/lib/oidc.ts`.

**Database:** `server/db/schema.ts` — Drizzle ORM schema with `pgTable()`, `pgEnum()`, `relations()`. `server/db/index.ts` — DB connection singleton using postgres.js driver.
- All columns use snake_case; Drizzle maps to camelCase JS properties automatically
- Config: `drizzle.config.ts` at project root
- **Core tables:** user, session, account, verification, passkey (Better Auth), profiles, app_settings, clients, products, quotes, quote_items, invoices, invoice_items, payments, pdf_documents, activity_log, client_credits, role_permissions, user_permission_overrides
- **Project tables:** projects, projectTypes, projectRoles, projectNotes, projectAssignments
- **Team tables:** teamMembers, teamPayments, teamAdvances, teamSalary
- **Expense tables:** expenses, expenseCategories, vendors, recurringExpenses
- **Other tables:** notifications, backups, backupDestinations, backupUploads
- **Enums:** UserRole (admin, user), ProductType (sq_ft, regular), DiscountType (percent, fixed), InvoiceStatus (pending, partial, paid), ProjectStatus (lead, booked, shooting, editing, delivered, completed, archived), RecurringFrequency (weekly, monthly, yearly), ExpenseType (expense, credit), BackupStatus (pending, running, completed, partial, failed), BackupUploadStatus (pending, uploading, completed, failed)
- **IDs:** All primary keys are `text` type using `crypto.randomUUID()` via `.$defaultFn()` (not native `uuid` type — legacy from Prisma migration)
- **Timestamps:** All tables have `createdAt` (`.defaultNow()`) and `updatedAt` — but `updatedAt` must be set explicitly with `new Date()` in every `.set()` call (no auto-update)
- **Line items:** Stored in relational `quote_items` / `invoice_items` tables (not JSONB). Helper `server/lib/items.ts` serializes DB→API and parses API→DB. Routes include `with: { items: { orderBy: sortOrder asc } }`
- **Cascade rules:** user→session/account cascade delete, invoices→payments cascade delete, clients→quotes/invoices set null on delete

**Routes (in `server/routes/`):**

*Billing & Clients:*
- `settings.ts` — GET/PUT `/api/settings`, GET `/api/settings/public` (no auth)
- `clients.ts` — CRUD + upsert + export at `/api/clients`
- `products.ts` — CRUD + upsert + bulk delete + export at `/api/products`
- `quotes.ts` — CRUD + bulk delete at `/api/quotes`
- `invoices.ts` — CRUD + bulk delete at `/api/invoices`
- `payments.ts` — POST/DELETE at `/api/payments`
- `credits.ts` — Client credit management at `/api/credits`
- `taxRates.ts` — Bulk tax rate lookup via API Ninjas at `/api/tax-rates`
- `stats.ts` — Dashboard aggregates at `/api/stats/dashboard`

*Projects & Calendar:*
- `projects.ts` — CRUD with status/client/date filtering, project locking, archiving at `/api/projects`
- `projectTypes.ts` — Admin CRUD for project type categories at `/api/project-types`
- `projectRoles.ts` — Admin CRUD for custom project roles at `/api/project-roles`
- `assignments.ts` — Project team member assignments (hours/days/role) at `/api/assignments`
- `calendar.ts` — `GET /api/calendar?start=&end=&teamMemberId=` with overlap detection and role-based filtering

*Team & Finance:*
- `team.ts` — Team member list/detail, unlinked members at `/api/team`
- `teamPayments.ts` — Team payment CRUD with advance repayment and salary deduction at `/api/team-payments`
- `teamAdvances.ts` — Advance/repayment tracking with balance calculation at `/api/team-advances`
- `teamSalary.ts` — Salary accrual/payment ledger at `/api/team-salary`

*Expenses:*
- `expenses.ts` — Expense CRUD with pagination, filters, stats at `/api/expenses`
- `expenseCategories.ts` — Category CRUD with bulk reorder at `/api/expense-categories`
- `vendors.ts` — Vendor CRUD with bulk reorder at `/api/vendors`
- `recurringExpenses.ts` — Recurring expense templates with frequency/auto-generation at `/api/recurring-expenses`

*Payments & Public:*
- `stripe.ts` — Stripe PaymentIntents, payment confirmation, and refunds at `/api/stripe`
- `paypal.ts` — Admin PayPal payment routes at `/api/paypal` (authenticated)
- `pay.ts` — Public invoice payment routes at `/api/pay` (no auth — token-based). Stripe + PayPal flows, receipt PDF download
- `approve.ts` — Public quote approval at `/api/approve` (no auth — token-based). Converts quote to invoice, queues invoice email

*Auth & Users:*
- `users.ts` — Profile + admin user management at `/api/users`
- `oidc.ts` — Custom OIDC authentication flow at `/api/oidc`
- `google.ts` — Google OAuth flow at `/api/google`
- `gdriveAuth.ts` — Google Drive OAuth callback for backup authentication at `/api/gdrive`
- `permissions.ts` — GET/PUT role defaults, GET/PUT user overrides at `/api/permissions` (owner only)

*Infrastructure:*
- `storage.ts` — File uploads at `/api/storage`
- `email.ts` — Email sending at `/api/email`
- `pdf.ts` — PDF generation at `/api/pdf/generate`, token-based download at `/api/pdf/download/:token`
- `activityLog.ts` — Paginated admin-only log at `/api/activity-log`
- `notifications.ts` — User notification CRUD (list, mark read, delete) at `/api/notifications`
- `backup.ts` — Multi-destination backup management (S3, B2, Google Drive), scheduling, history at `/api/backup`
- `unsplash.ts` — Random background image caching at `/api/unsplash`
- `errors.ts` — POST `/api/errors` (auth-optional). Frontend errors logged to `activity_log`
- `setup.ts` — Setup wizard routes for initial configuration

**Shared libraries (`server/lib/`):**
- `rpc.ts` — `getNextDocumentNumber()` (unified counter with transaction), `deleteClientAndRelatedData()` (cascade delete)
- `permissions.ts` — `getUserRoleAndApproval()` (60s cached), `requireAdmin`, `requirePermission(...keys)` (granular preHandler hook), `requireRole()`, `requireSelfOrRole()`, `hasPermission(request, key)`, `isAdmin()`
- `permissionConfig.ts` — Permission keys, metadata (labels/groups/descriptions), hardcoded defaults per role. Resolution: user overrides → role overrides → hardcoded defaults. Owner always gets all permissions
- `generatePdf.ts` — Invoice/quote PDF generation engine using pdf-lib
- `generateReceiptPdf.ts` — Receipt PDF generation (separate from invoice PDF)
- `mailer.ts` — SMTP settings, transporter creation, email templates, `sendPaymentNotification()` (fire-and-forget)
- `activityLog.ts` — Fire-and-forget `logActivity()` for audit trail, `actorFromRequest()` helper
- `queue.ts` — BullMQ queues (email, cleanup, invoice-reminders, backup, recurring-expenses, salary-accrual) with shared Redis connection
- `notifications.ts` — In-app notification creation: `notifyUsers()`, `getPrivilegedUserIds()`
- `teamCalc.ts` — `recalculateProjectTeamFinancials()` — computes teamCost and margin from paid team payments
- `expenseSync.ts` — Syncs team payments with linked expense records
- `backupArchive.ts` — Archive creation for backups (database + uploads)
- `backupStorage.ts` — Multi-provider cloud storage abstraction (S3, B2, Google Drive)
- `dates.ts` — `parseDateInput()` date parsing utility
- `companyInfo.ts` — Company/profile information helpers
- `items.ts` — Serializes DB→API and parses API→DB for quote/invoice line items
- `oidc.ts` — OIDC discovery, authorization, callback utilities

**Workers (`server/workers/`):** BullMQ background job processors, entry point `server/worker.ts`.
- `email.worker.ts` — Generates PDF, sends SMTP, logs activity. 3 retries with exponential backoff.
- `invoiceReminders.worker.ts` — Daily 9 AM cron, queues reminder emails for overdue invoices.
- `cleanup.worker.ts` — Daily 3 AM cron, prunes expired PDFs, old activity logs, expired sessions.
- `backup.worker.ts` — Creates backup archives and uploads to configured cloud destinations.
- `recurringExpenses.worker.ts` — Auto-generates expense entries from recurring templates on schedule.
- `salaryAccrual.worker.ts` — Accrues weekly salary for team members with salaryEnabled flag.
- **Production:** `pm2 start ecosystem.config.cjs` runs both server and worker.
- **Dev:** `npm run dev:worker` (tsx watch mode). Redis runs on Docker port 6381 (`REDIS_URL=redis://localhost:6381`).

**Uploads:** `server/uploads/avatars/`, `server/uploads/branding/` — served via `@fastify/static`

**Vite proxy:** `/api` and `/uploads` requests are proxied to Fastify during development.

### Styling
- Notion-style light theme with CSS custom properties in `src/index.css` (RGB color tokens for surfaces, HSL for shadcn compatibility)
- Surface scale: `--surface-50` (lightest, page bg) through `--surface-950` (darkest, black text)
- Sidebar: warm gray with dedicated `--sidebar-*` tokens
- Component classes: `.glass-card`, `.glass-elevated`, `.glass-input`, `.glass-button`, `.glass-button-secondary`, `.glass-button-destructive`, `.glass-modal`, `.glass-table`, `.flat-card`, `.chip`, `.icon-button`, `.list-card`, `.scrollbar-hide`
- In-view tab classes: `.nav-tabs`, `.nav-tab`, `.nav-tab-active`, `.nav-tab-glass` (for QuotesManager/InvoicesManager/ClientProfile tab switching)
- shadcn/ui-style components in `src/components/ui/` using `cn()` from `src/lib/utils.js`
- Tailwind config uses HSL variable-based color system

### ESLint
Flat config in `eslint.config.mjs`. **Only covers frontend `.js`/`.jsx` files** — server TypeScript is not linted. Key rules: `no-undef: error`, `import/no-self-import: error`. Most style/non-critical rules are disabled. React prop-types validation is off.

### Bundle Splitting
Production build uses vendor chunk splitting (`manualChunks` in `vite.config.js`) and route-level lazy loading (`React.lazy` in `App.jsx`):
- **Vendor chunks:** `react-vendor` (react, react-dom, scheduler), `ui-vendor` (framer-motion, radix-ui, cmdk, cva, clsx, tailwind-merge), `data-vendor` (react-query, better-auth), `stripe-vendor`, `paypal-vendor` — stable across deploys
- **Note:** `react-router-dom` is bundled in the main app chunk (NOT in react-vendor) to avoid circular dependency with data-vendor
- **All views** are lazy-loaded via `React.lazy` + `Suspense` in `App.jsx`

### Deployment (`scripts/`)

**Two-step deploy to a bare VPS (Ubuntu/Debian, x86 or ARM64):**

1. **`scripts/deploy.sh`** — Run as root. Idempotent VPS provisioning:
   - Detects distro (Ubuntu/Debian) for correct package repos
   - Creates 2GB swap if none exists (prevents OOM on low-memory VPS like Oracle/AWS free tier)
   - Installs Node.js 24 LTS, npm (latest), PostgreSQL, Docker CE, pm2, Nginx, Certbot, UFW
   - Adds all login users to docker group
   - Flushes pre-existing iptables rules (Oracle Cloud ships restrictive defaults), enables UFW
   - Suppresses interactive `needrestart` prompts (`DEBIAN_FRONTEND=noninteractive`)
   - Certbot falls back to apt if snap is unavailable

2. **`scripts/install.sh`** — Run as app user from repo root. Only asks for domain name + SSL choice:
   - Validates it's running from app root (checks `package.json`)
   - Derives DB name/user from directory name (forced lowercase, sanitized)
   - Auto-detects available ports for Redis and app, auto-detects PG port
   - Creates PG user+DB, Docker Redis (`redis:8-alpine`), generates `.env` and `ecosystem.config.cjs`
   - SSL options: (1) Certbot/Let's Encrypt, (2) Cloudflare with auto-generated self-signed cert, (3) Skip
   - Runs `npm install`, `db:push`, `build`
   - Starts pm2 + configures `pm2 startup` for reboot persistence
   - On `--force` re-install: updates PG password (no auth mismatch), ensures Redis container is running
   - Certbot failure is non-fatal (app runs on HTTP, warns to fix later)

3. **`/setup` (Setup Wizard)** — Browser-based first-time configuration:
   - Fresh install: create admin account + company name
   - Restore: connect to S3/B2/Google Drive, select backup, restore DB + uploads
   - Restore drops schema before `psql` load (handles both old and new backup formats)
   - Auto-updates `company_website` to new domain after restore
   - `setup_complete` key in `app_settings` prevents re-access after setup

4. **`scripts/restore.js`** / `npm run restore` — Interactive CLI restore (headless VPS recovery):
   - Prompts for cloud provider + credentials → lists backups → downloads + extracts
   - Restores `.env` from backup (user must manually update `BETTER_AUTH_URL` for new domain)
   - Restores database via `psql` and uploads directory

**Typical deploy after code changes:**
```bash
git pull
npm install                  # If dependencies changed
npm run db:push              # If schema changed
npm run build                # Rebuild frontend
pm2 restart all              # Restart server + worker
```

**Backup archives** (`.tar.gz`): `database.sql` (`pg_dump --clean --if-exists`), `uploads/`, `.env`, `manifest.json`.

**ARM64 compatible:** Only native dep is `msgpackr-extract` (BullMQ) which has ARM64 prebuilds and pure-JS fallback. Tested on AWS Graviton and Oracle Ampere.

### Environment Variables
See `.env.example` for all required/optional environment variables (DATABASE_URL, BETTER_AUTH_SECRET, OAuth, SMTP, etc.).
