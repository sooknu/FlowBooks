# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KreAction Quotes is a business quoting, invoicing, and client management web app. It uses a self-hosted Fastify + Drizzle ORM + PostgreSQL backend with Better Auth for authentication. The frontend is React + Vite with a Notion-style light UI theme and sidebar navigation. Server files are TypeScript, run via tsx.

## Commands

- **Dev (full stack):** `npm run dev` — starts both Vite (port 3000) and Fastify (port 3002) via concurrently
- **Dev (client only):** `npm run dev:client`
- **Dev (server only):** `npm run dev:server`
- **Start (production):** `npm start` — runs `tsx --env-file=.env server/index.ts`
- **Build:** `npm run build` (runs `tools/generate-llms.js` then `vite build`)
- **Preview:** `npm run preview` (serves built output on port 3000)
- **Lint:** `npx eslint .`
- **DB push:** `npm run db:push` — sync Drizzle schema to database
- **DB migrate:** `npm run db:migrate` — run Drizzle migrations
- **DB studio:** `npm run db:studio` — Drizzle Studio GUI
- **DB generate:** `npm run db:generate` — generate Drizzle migration files
- **Start worker:** `npm run start:worker` — runs BullMQ worker process
- **Dev worker:** `npm run dev:worker` — runs worker in tsx watch mode
- **Node version:** 20.19.1 (see `.nvmrc`)

No test framework is configured.

## Architecture

### Tech Stack
- **Frontend:** React 18, Vite 4, Tailwind CSS 3, React Router 7, PostCSS/Autoprefixer
- **Backend:** Fastify 5, Drizzle ORM (PostgreSQL via postgres.js), Better Auth, TypeScript (tsx)
- **UI:** Radix UI primitives (`@radix-ui/react-*`) wrapped in `src/components/ui/`
- **Other:** Framer Motion for animations, Lucide for icons, pdf-lib for PDF generation, nodemailer for email

### Path Alias
`@` maps to `./src` (configured in `vite.config.js` and `eslint.config.mjs`). Always use `@/` imports.

### Frontend Structure

**Entry:** `src/main.jsx` → renders `<ErrorBoundary>` → `<QueryClientProvider>` → `<AuthProvider>` → `<BrowserRouter>` → `<App />` + `<Toaster />`. Also sets up global error capture: `reportError()` (POSTs to `/api/errors` with 30s dedup), `window.onerror`, `window.onunhandledrejection`, and `ErrorBoundary.componentDidCatch`.

**Routing:** React Router (`react-router-dom`) with `BrowserRouter`. `App.jsx` defines `<Routes>` with nested layout routes. Navigation uses `useNavigate()` hook.

**Layout:** Sidebar navigation (`Sidebar.jsx`) + content area (`AppLayout.jsx`). Auth boundary via `AuthGuard.jsx` (shows LoginPage or PendingApprovalPage when not authenticated). Admin routes protected by `AdminGuard.jsx`.

**Route structure:**
- `/` → redirects to `/dashboard`
- `/dashboard`, `/quotes`, `/invoices`, `/clients`, `/clients/:id` — main views
- `/services` — ProductsManager, `/team` — UsersManager (admin)
- `/settings` → `SettingsLayout.jsx` with sub-routes: `/settings/general`, `/settings/payments`, `/settings/email`, `/settings/permissions`, `/settings/activity` (admin)
- `/approve/:token`, `/pay/:token`, `/verified` — public routes (no auth/sidebar)
- `/projects`, `/calendar`, `/payments`, `/contracts`, `/deliverables`, `/schedule`, `/expenses`, `/reports` — ComingSoon placeholders

**Data flow:** On-demand loading via TanStack React Query. `useAppData()` hook loads `settings` and `profile` on auth. Each view fetches its own data:
- **Dashboard** — `GET /api/stats/dashboard` (SQL aggregates, no full records)
- **List views** (Clients, Quotes, Invoices) — own `useInfiniteQuery` with server-side pagination
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
- `SettingsLayout` — settings shell with 5 sub-tabs: `BrandingManager`, `PaymentGatewayManager`, `EmailManager`, `PermissionsManager`, `ActivityLogViewer`
- `ProductsManager` — services/products CRUD (at `/services`)
- `ProfileManager` — user profile and password management
- `UsersManager` — admin user management (at `/team`)

### Backend Structure (`server/`)

**Entry:** `server/index.ts` — Fastify with CORS, multipart, static file serving, auth middleware, Better Auth handler. Middleware order matters: CORS → cookie signing → multipart (10MB limit) → static files → `/uploads/documents/` blocking (403) → auth extraction hook → Better Auth handler → app routes → SPA fallback (production).

**Auth middleware:** The auth hook populates `request.user`, `request.session`, `request.userRole`, and `request.permissions`. It skips: `/api/auth/*`, `/api/oidc/*`, `/api/google/*`, `/api/settings/public`, `/api/users/check-verification`, `/uploads/*`, `/api/pdf/download/:token`, `/api/pay/*`, `/api/approve/*`.

**Auth:** `server/auth.ts` — Better Auth config with Drizzle adapter, email/password, Google OAuth, admin plugin. Custom OIDC flow via `server/routes/oidc.ts` and `server/lib/oidc.ts` (discovery, authorization, callback with auto user creation/linking, manual session cookie management).

**Database:** `server/db/schema.ts` — Drizzle ORM schema with `pgTable()`, `pgEnum()`, `relations()`. `server/db/index.ts` — DB connection singleton using postgres.js driver.
- Tables: user, session, account, verification (Better Auth), profiles, app_settings, clients, products, quotes, invoices, payments, pdf_documents, activity_log, client_credits, role_permissions, user_permission_overrides
- All columns use snake_case; Drizzle maps to camelCase JS properties automatically
- Config: `drizzle.config.ts` at project root
- **Enums:** `UserRole` (admin, user), `ProductType` (sq_ft, regular), `DiscountType` (percent, fixed), `InvoiceStatus` (pending, partial, paid)
- **IDs:** All primary keys are `text` type using `crypto.randomUUID()` via `.$defaultFn()` (not native `uuid` type — legacy from Prisma migration)
- **Timestamps:** All tables have `createdAt` (`.defaultNow()`) and `updatedAt` — but `updatedAt` must be set explicitly with `new Date()` in every `.set()` call (no auto-update)
- **Line items:** Stored in relational `quote_items` / `invoice_items` tables (not JSONB). Helper `server/lib/items.ts` serializes DB→API and parses API→DB. Routes include `with: { items: { orderBy: sortOrder asc } }`
- **Cascade rules:** user→session/account cascade delete, invoices→payments cascade delete, clients→quotes/invoices set null on delete

**Routes (in `server/routes/`):**
- `settings.ts` — GET/PUT `/api/settings`, GET `/api/settings/public` (no auth)
- `clients.ts` — CRUD + upsert + export at `/api/clients`
- `products.ts` — CRUD + upsert + bulk delete + export at `/api/products`
- `quotes.ts` — CRUD + bulk delete at `/api/quotes`
- `invoices.ts` — CRUD + bulk delete at `/api/invoices`
- `payments.ts` — POST/DELETE at `/api/payments`
- `stripe.ts` — Stripe PaymentIntents, payment confirmation, and refunds at `/api/stripe`
- `users.ts` — Profile + admin user management at `/api/users`
- `storage.ts` — File uploads at `/api/storage`
- `email.ts` — Email sending at `/api/email`
- `pdf.ts` — PDF generation at `/api/pdf/generate`, secure token-based download at `/api/pdf/download/:token` (no auth — token IS the auth)
- `oidc.ts` — Custom OIDC authentication flow at `/api/oidc` (authorize, callback)
- `google.ts` — Google OAuth flow at `/api/google` (authorize, callback, account linking)
- `activityLog.ts` — Paginated admin-only log at `/api/activity-log`
- `taxRates.ts` — Bulk tax rate lookup via API Ninjas at `/api/tax-rates`
- `credits.ts` — Client credit management at `/api/credits`
- `stats.ts` — Dashboard aggregates at `/api/stats/dashboard` (counts, revenue, recent items via SQL)
- `pay.ts` — Public invoice payment routes at `/api/pay` (no auth — token-based). Stripe + PayPal payment flows, receipt PDF download. Sends admin notification on payment.
- `paypal.ts` — Admin PayPal payment routes at `/api/paypal` (authenticated)
- `approve.ts` — Public quote approval at `/api/approve` (no auth — token-based). Converts quote to invoice, queues invoice email, returns payment link.
- `permissions.ts` — GET/PUT role defaults, GET/PUT user overrides, reset/clear at `/api/permissions` (owner only)
- `errors.ts` — POST `/api/errors` (auth-optional — authenticated users get name, anonymous logged as "Anonymous"). Writes frontend errors to `activity_log` with `entityType: 'error'`, `action: 'frontend_error'`

**Shared libraries (`server/lib/`):**
- `rpc.ts` — `getNextDocumentNumber()` (unified counter with transaction), `deleteClientAndRelatedData()` (cascade delete clients→quotes/invoices/payments)
- `permissions.ts` — `getUserRoleAndApproval()` (60s cached, includes resolved permissions), `requireAdmin`, `requirePermission(...keys)` (granular preHandler hook), `requireRole()`, `requireSelfOrRole()`, `hasPermission(request, key)`, `isAdmin()`
- `permissionConfig.ts` — 21 permission keys, metadata (labels/groups/descriptions), hardcoded defaults per role. Resolution: user overrides → role overrides → hardcoded defaults. Owner always gets all permissions.
- `generatePdf.ts` — PDF generation engine using pdf-lib
- `mailer.ts` — `getSmtpSettings()`, `createTransporter()`, `buildFromAddress()`, `getCompanySettings()`, `sendPaymentNotification()` (fire-and-forget admin email on online payments), email template builders
- `activityLog.ts` — Fire-and-forget `logActivity()` for audit trail, `actorFromRequest()` helper. `userId` param accepts `string | null` for anonymous error logging
- `queue.ts` — BullMQ queues (email, cleanup, invoice-reminders) with shared Redis (ioredis) connection
- `oidc.ts` — OIDC discovery, authorization, callback utilities

**Workers (`server/workers/`):** BullMQ background job processors, entry point `server/worker.ts`.
- `email.worker.ts` — Generates PDF, sends SMTP, logs activity. 3 retries with exponential backoff.
- `invoiceReminders.worker.ts` — Daily 9 AM cron, queues reminder emails for overdue invoices.
- `cleanup.worker.ts` — Daily 3 AM cron, prunes expired PDFs, old activity logs, expired sessions.
- **Production:** `pm2 start ecosystem.config.cjs` runs both server (`madrid-quotes`) and worker (`madrid-worker`).
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
Flat config in `eslint.config.mjs`. Key rules: `no-undef: error`, `import/no-self-import: error`. Most style/non-critical rules are disabled. React prop-types validation is off.

### Bundle Splitting
Production build uses vendor chunk splitting (`manualChunks` in `vite.config.js`) and route-level lazy loading (`React.lazy` in `App.jsx`):
- **Vendor chunks:** `react-vendor` (react, react-dom, scheduler), `ui-vendor` (framer-motion, radix-ui, cmdk, cva, clsx, tailwind-merge), `data-vendor` (react-query, better-auth), `stripe-vendor`, `paypal-vendor` — stable across deploys
- **Note:** `react-router-dom` is bundled in the main app chunk (NOT in react-vendor) to avoid circular dependency with data-vendor
- **All views** are lazy-loaded via `React.lazy` + `Suspense` in `App.jsx`

### Environment Variables
See `.env.example` for all required/optional environment variables (DATABASE_URL, BETTER_AUTH_SECRET, OAuth, SMTP, etc.).
