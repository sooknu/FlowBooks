# Stack.md — Madrid Photography Technical Reference

## Runtime
- **Node:** 20.19.1 (`.nvmrc`)
- **TypeScript:** 5.9.3 (server only, via `tsx`)
- **Module System:** ESM (`"type": "module"`)
- **Package Manager:** npm

---

## Backend

### Core
| Package | Version | Purpose |
|---------|---------|---------|
| fastify | 5.7.4 | HTTP server |
| drizzle-orm | 0.45.1 | ORM / query builder |
| postgres | 3.4.8 | PostgreSQL driver (postgres.js) |
| better-auth | 1.4.18 | Authentication (email/password, Google, OIDC, admin plugin) |
| tsx | 4.21.0 | TypeScript execution |

### Fastify Plugins
| Package | Version | Purpose |
|---------|---------|---------|
| @fastify/cookie | 11.0.2 | Cookie parsing (OIDC state) |
| @fastify/cors | 11.2.0 | CORS |
| @fastify/helmet | 13.0.2 | Security headers |
| @fastify/multipart | 9.4.0 | File uploads (10MB limit) |
| @fastify/rate-limit | 10.3.0 | Rate limiting (100 req/min) |
| @fastify/static | 9.0.0 | Static file serving |

### Background Jobs
| Package | Version | Purpose |
|---------|---------|---------|
| bullmq | 5.67.3 | Job queues (email, cleanup, reminders) |
| ioredis | 5.9.2 | Redis client for BullMQ |

### Integrations
| Package | Version | Purpose |
|---------|---------|---------|
| stripe | 20.3.1 | Stripe payments (server) |
| @paypal/paypal-server-sdk | 2.2.0 | PayPal payments (server) |
| nodemailer | 8.0.0 | SMTP email |
| pdf-lib | 1.17.1 | PDF generation |
| jsonwebtoken | 9.0.3 | JWT utilities |

---

## Frontend

### Core
| Package | Version | Purpose |
|---------|---------|---------|
| react | 18.2.0 | UI library |
| react-dom | 18.2.0 | DOM renderer |
| react-router-dom | 7.13.0 | Client-side routing |
| vite | 4.4.5 | Build tool / dev server |
| @vitejs/plugin-react | 4.0.3 | Vite React plugin |

### Data & State
| Package | Version | Purpose |
|---------|---------|---------|
| @tanstack/react-query | 5.90.20 | Server state management |
| @tanstack/react-query-devtools | 5.91.3 | DevTools |

### UI Components
| Package | Version | Purpose |
|---------|---------|---------|
| framer-motion | 10.16.4 | Animations |
| lucide-react | 0.285.0 | Icons |
| cmdk | 0.2.0 | Command palette |
| @radix-ui/react-alert-dialog | 1.0.5 | Alert dialogs |
| @radix-ui/react-avatar | 1.0.3 | Avatars |
| @radix-ui/react-checkbox | 1.0.4 | Checkboxes |
| @radix-ui/react-dialog | 1.0.5 | Dialogs |
| @radix-ui/react-dropdown-menu | 2.0.5 | Dropdown menus |
| @radix-ui/react-label | 2.0.2 | Labels |
| @radix-ui/react-popover | 1.0.7 | Popovers |
| @radix-ui/react-slot | 1.0.2 | Slot composition |
| @radix-ui/react-tabs | 1.0.4 | Tabs |
| @radix-ui/react-toast | 1.1.5 | Toast notifications |

### Styling
| Package | Version | Purpose |
|---------|---------|---------|
| tailwindcss | 3.3.3 | Utility CSS |
| tailwindcss-animate | 1.0.7 | Animation utilities |
| class-variance-authority | 0.7.0 | Component variants |
| clsx | 2.0.0 | Conditional classes |
| tailwind-merge | 1.14.0 | Class deduplication |
| autoprefixer | 10.4.16 | CSS vendor prefixes |
| postcss | 8.4.31 | CSS processing |

### Payment UIs
| Package | Version | Purpose |
|---------|---------|---------|
| @stripe/react-stripe-js | 5.6.0 | Stripe Elements |
| @stripe/stripe-js | 8.7.0 | Stripe.js loader |
| @paypal/react-paypal-js | 8.9.2 | PayPal Buttons |

### Dev Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| typescript | 5.9.3 | Type checking |
| drizzle-kit | 0.31.8 | Schema migrations |
| eslint | 8.57.1 | Linting |
| concurrently | 9.2.1 | Parallel dev processes |
| terser | 5.39.0 | JS minification |

---

## Database Schema

### Enums
| Enum | Values |
|------|--------|
| UserRole | admin, user |
| ProductType | product, service |
| DiscountType | percent, fixed |
| InvoiceStatus | pending, partial, paid |
| DeliveryStatus | scheduled, in_editing, delivered |
| ProjectType | wedding, commercial, real_estate, portrait, event |
| ProjectStatus | lead, booked, shooting, editing, delivered, completed, archived |
| TeamRole | owner, manager, lead, crew |
| TeamPaymentStatus | pending, paid |

### Tables (22 total)
| Table | Purpose | Key Relations |
|-------|---------|---------------|
| user | Better Auth managed | → sessions, accounts, profile |
| session | Better Auth managed | → user (cascade) |
| account | Better Auth managed | → user (cascade) |
| verification | Better Auth managed | — |
| profiles | User profile extension | → user (1:1, cascade) |
| app_settings | Key-value config store | — |
| clients | Client records | → quotes, invoices, projects, notes, credits |
| products | Service/product catalog | — |
| projects | Photography projects | → client, quotes, invoices, notes, assignments, teamPayments |
| project_notes | Notes on projects | → project (cascade) |
| quotes | Quote documents | → client (set null), project (set null), items |
| quote_items | Quote line items | → quote (cascade), product (set null) |
| invoices | Invoice documents | → client (set null), project (set null), quote (set null), items, payments |
| invoice_items | Invoice line items | → invoice (cascade), product (set null) |
| payments | Payment transactions | → invoice (cascade) |
| pdf_documents | PDF metadata + tokens | — |
| activity_log | Audit trail | → user (set null) |
| client_notes | Notes on clients | → client (cascade) |
| client_credits | Client credit balances | → client (cascade) |
| team_members | Team member records | → user (cascade, unique), assignments, payments |
| project_assignments | Team ↔ project mapping | → project (cascade), team_member (cascade). Unique(project, member) |
| team_payments | Payments to team members | → team_member (cascade), project (set null), paidBy user (set null) |

### Schema Notes
- All IDs: `text` type via `crypto.randomUUID()` (not native uuid — legacy from Prisma)
- All timestamps: `timestamp` with `mode: 'date'`
- `updatedAt` must be set explicitly (`new Date()`) in every `.set()` call
- Line items: relational tables, not JSONB

---

## Server Routes (24 modules)

| Route File | Prefix | Auth | Purpose |
|-----------|--------|------|---------|
| settings.ts | `/api/settings` | Yes (+ public GET) | App settings CRUD |
| clients.ts | `/api/clients` | Yes | Client CRUD + upsert + export + notes |
| products.ts | `/api/products` | Yes | Product CRUD + upsert + bulk delete + export |
| projects.ts | `/api/projects` | Yes | Project CRUD + notes |
| quotes.ts | `/api/quotes` | Yes | Quote CRUD + bulk delete |
| invoices.ts | `/api/invoices` | Yes | Invoice CRUD + bulk delete |
| payments.ts | `/api/payments` | Yes | Payment POST/DELETE |
| stripe.ts | `/api/stripe` | Yes | PaymentIntents, confirm, refund |
| paypal.ts | `/api/paypal` | Yes | Admin PayPal operations |
| credits.ts | `/api/credits` | Yes | Client credit management |
| users.ts | `/api/users` | Yes | Profile + admin user CRUD |
| email.ts | `/api/email` | Yes | Email sending (via BullMQ queue) |
| pdf.ts | `/api/pdf` | Mixed | Generate (auth) + download (token-based) |
| storage.ts | `/api/storage` | Yes | File uploads (avatars, branding) |
| stats.ts | `/api/stats` | Yes | Dashboard aggregates |
| activityLog.ts | `/api/activity-log` | Admin | Paginated activity log |
| taxRates.ts | `/api/tax-rates` | Yes | Tax rate lookup (API Ninjas) |
| approve.ts | `/api/approve` | No | Public quote approval (token) |
| pay.ts | `/api/pay` | No | Public invoice payment (token) |
| oidc.ts | `/api/oidc` | No | Custom OIDC auth flow |
| google.ts | `/api/google` | No | Google OAuth flow |
| team.ts | `/api/team` | Role-based | Team member CRUD (owner/manager) |
| assignments.ts | `/api/assignments` | Role-based | Project assignments CRUD |
| teamPayments.ts | `/api/team-payments` | Role-based | Team payment tracking |

---

## Server Middleware Stack (order matters)

1. Custom JSON parser (tolerates empty bodies)
2. `@fastify/helmet` (CSP off, COOP same-origin-allow-popups)
3. `@fastify/rate-limit` (100 req/min, localhost allowlist)
4. `@fastify/cors` (CLIENT_ORIGIN, credentials: true)
5. `@fastify/cookie` (signed with BETTER_AUTH_SECRET)
6. `@fastify/multipart` (10MB limit)
7. `@fastify/static` (serves `/uploads/avatars/`, `/uploads/branding/`)
8. Block `/uploads/documents/` (403 — token-only download)
9. Auth extraction hook → populates `request.user`, `.session`, `.userRole`
10. Better Auth handler (`/api/auth/*`, 10 req/min)
11. Static frontend serve (production: `/dist`, SPA fallback)
12. Application route modules (21 files)

---

## Workers (BullMQ)

| Worker | Schedule | Purpose |
|--------|----------|---------|
| email.worker.ts | On demand | Generate PDF + send SMTP (3 retries, exponential backoff) |
| cleanup.worker.ts | Daily 3 AM | Prune expired PDFs, old activity logs, expired sessions |
| invoiceReminders.worker.ts | Daily 9 AM | Queue reminder emails for overdue invoices |

---

## Frontend Structure

### Route Map
| Path | Component | Auth |
|------|-----------|------|
| `/approve/:token` | QuoteApprovalPage | Public |
| `/pay/:token` | PayOnlinePage | Public |
| `/verified` | AccountVerified | Public |
| `/dashboard` | Dashboard | Yes |
| `/projects` | ProjectsManager | Yes |
| `/projects/:id` | ProjectDetail | Yes |
| `/quotes` | QuotesManager | Yes |
| `/invoices` | InvoicesManager | Yes |
| `/clients` | ClientsManager | Yes |
| `/clients/:id` | ClientProfile | Yes |
| `/services` | ProductsManager | Yes |
| `/profile` | ProfileManager | Yes |
| `/settings/*` | SettingsLayout (5 sub-tabs) | Admin |
| `/team` | UsersManager | Admin |

### Key Patterns
- **Data fetching:** TanStack React Query (`useInfiniteQuery` for lists, `useQuery` for details)
- **Mutations:** Centralized in `src/hooks/useMutations.js` with toast + invalidation
- **Query keys:** Factory in `src/lib/queryKeys.js`
- **API client:** `src/lib/apiClient.js` — thin fetch wrapper, `credentials: 'include'`
- **Auth:** `src/contexts/AuthContext.jsx` → `useAuth()` (Better Auth React client)
- **Lazy loading:** All views via `React.lazy` + `Suspense`
- **Animations:** Framer Motion (`layoutId` for tab indicators, `AnimatePresence` for tab content)

### Build Chunks (Vite manual splitting)
| Chunk | Contents |
|-------|----------|
| react-vendor | react, react-dom, scheduler |
| ui-vendor | framer-motion, radix-ui, cmdk, cva, clsx, tailwind-merge |
| data-vendor | @tanstack, better-auth |
| stripe-vendor | @stripe |
| paypal-vendor | @paypal |
| (main) | react-router-dom + app code (avoids circular dep with data-vendor) |

---

## Config Files
| File | Purpose |
|------|---------|
| `.nvmrc` | Node version (20.19.1) |
| `.env` | Environment variables |
| `ecosystem.config.cjs` | PM2 process config (server + worker) |
| `vite.config.js` | Vite build config (alias `@→./src`, proxy, chunks) |
| `tailwind.config.js` | Tailwind theme (surface colors, Sora font, animations) |
| `drizzle.config.ts` | Drizzle ORM config (schema path, migrations dir) |
| `eslint.config.mjs` | ESLint flat config |
| `postcss.config.js` | PostCSS (tailwindcss + autoprefixer) |
| `CLAUDE.md` | AI assistant instructions |
