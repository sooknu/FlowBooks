import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import compress from '@fastify/compress';
import etag from '@fastify/etag';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auth } from './auth';

import clientRoutes from './routes/clients';
import productRoutes from './routes/products';
import quoteRoutes from './routes/quotes';
import invoiceRoutes from './routes/invoices';
import paymentRoutes from './routes/payments';
import settingRoutes from './routes/settings';
import userRoutes from './routes/users';
import storageRoutes from './routes/storage';
import emailRoutes from './routes/email';
import pdfRoutes from './routes/pdf';
import oidcRoutes from './routes/oidc';
import googleRoutes from './routes/google';
import activityLogRoutes from './routes/activityLog';
import taxRatesRoutes from './routes/taxRates';
import creditRoutes from './routes/credits';
import statsRoutes from './routes/stats';
import stripeRoutes from './routes/stripe';
import paypalRoutes from './routes/paypal';
import payRoutes from './routes/pay';
import approveRoutes from './routes/approve';
import projectRoutes from './routes/projects';
import teamRoutes from './routes/team';
import assignmentRoutes from './routes/assignments';
import teamPaymentRoutes from './routes/teamPayments';
import teamAdvanceRoutes from './routes/teamAdvances';
import teamSalaryRoutes from './routes/teamSalary';
import notificationRoutes from './routes/notifications';
import calendarRoutes from './routes/calendar';
import projectTypeRoutes from './routes/projectTypes';
import projectRoleRoutes from './routes/projectRoles';
import unsplashRoutes from './routes/unsplash';
import expenseCategoryRoutes from './routes/expenseCategories';
import expenseRoutes from './routes/expenses';
import recurringExpenseRoutes from './routes/recurringExpenses';
import permissionRoutes from './routes/permissions';
import errorRoutes from './routes/errors';
import backupRoutes from './routes/backup';
import gdriveAuthRoutes from './routes/gdriveAuth';
import setupRoutes from './routes/setup';
import reportsRoutes from './routes/reports';
import hubRoutes from './routes/hub';
import sseRoutes from './routes/sse';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'warn' } });

// Override default JSON parser to tolerate empty bodies (e.g. DELETE with Content-Type: application/json)
app.removeContentTypeParser('application/json');
app.addContentTypeParser('application/json', { parseAs: 'string' }, (req: any, body: any, done: any) => {
  if (!body || body.length === 0) return done(null, undefined);
  try { done(null, JSON.parse(body)); }
  catch (err) { done(err); }
});

// Response compression (gzip/brotli)
await app.register(compress, { global: true, threshold: 1024 });

// ETag support for conditional GET
await app.register(etag);

// Security headers
await app.register(helmet, {
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
});

// Rate limiting — effectively unlimited globally; per-route limits (e.g. /api/auth/*) still apply
await app.register(rateLimit, { max: 100000, timeWindow: '1 minute' });

// CORS
await app.register(cors, {
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
});

// Cookie signing (for OIDC state cookies)
await app.register(cookie, {
  secret: process.env.BETTER_AUTH_SECRET || 'change-me',
});

// Multipart (file uploads)
await app.register(multipart, {
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Serve uploaded files (avatars, branding — but NOT documents)
await app.register(fastifyStatic, {
  root: path.join(__dirname, 'uploads'),
  prefix: '/uploads/',
  decorateReply: false,
});

// Block direct access to /uploads/documents/ (PDFs served via /api/pdf/download/:token)
app.addHook('onRequest', async (request: any, reply: any) => {
  if (request.url.startsWith('/uploads/documents/')) {
    return reply.code(403).send({ error: 'Forbidden' });
  }
});

// Auth middleware — extract user from session for protected routes
app.decorateRequest('user', null);
app.decorateRequest('session', null);
app.decorateRequest('userRole', null);
app.decorateRequest('teamRole', null);
app.decorateRequest('teamMemberId', null);
app.decorateRequest('permissions', null);

app.addHook('onRequest', async (request: any, reply: any) => {
  // Skip auth for public routes and auth routes (Better Auth handles those)
  if (request.url.startsWith('/api/auth/')) return;
  if (request.url.startsWith('/api/oidc/')) return;
  if (request.url.startsWith('/api/google/')) return;
  if (request.url === '/api/settings/public') return;
  if (request.url.startsWith('/api/users/check-verification')) return;
  if (request.url.startsWith('/uploads/')) return;
  if (request.url.startsWith('/api/pdf/download/')) return;
  if (request.url.startsWith('/api/pay/')) return;
  if (request.url.startsWith('/api/approve/')) return;
  if (request.url.startsWith('/api/unsplash/background')) return;
  if (request.url.startsWith('/api/setup')) return;
  if (request.url.startsWith('/api/backup/gdrive/callback')) return;
  if (request.url.startsWith('/api/backup/gdrive/authorize-setup')) return;
  if (!request.url.startsWith('/api/')) return;

  try {
    const headers = new Headers();
    Object.entries(request.headers).forEach(([key, value]) => {
      if (value) headers.append(key, String(value));
    });

    const session = await auth.api.getSession({
      headers,
    });

    if (!session) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    request.user = session.user;
    request.session = session.session;

    // Attach role for downstream permission checks
    const { getUserRoleAndApproval, isSuperAdmin } = await import('./lib/permissions');
    const { role, teamRole, approved, displayName, teamMemberId, permissions } = await getUserRoleAndApproval(session.user.id);
    request.userRole = role;
    request.teamRole = teamRole;
    request.teamMemberId = teamMemberId;
    request.userDisplayName = displayName;
    request.permissions = permissions;

    // Block unapproved users (super admin always allowed, approval-status endpoint exempt)
    const isApprovalCheck = request.url.startsWith('/api/users/me/approval-status');
    const isErrorReport = request.url === '/api/errors' || request.url === '/api/errors/';
    if (!approved && !isApprovalCheck && !isErrorReport && !(await isSuperAdmin(session.user.id))) {
      reply.code(403).send({
        error: 'pending_approval',
        message: 'Your account is pending admin approval',
      });
      return;
    }
  } catch (error) {
    // Let error reports through even without auth
    if (request.url === '/api/errors' || request.url === '/api/errors/') return;
    reply.code(401).send({ error: 'Unauthorized' });
  }
});

// Mount Better Auth handler (official Fastify pattern)
app.route({
  method: ['GET', 'POST'],
  url: '/api/auth/*',
  config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  async handler(request: any, reply: any) {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const headers = new Headers();
      Object.entries(request.headers).forEach(([key, value]) => {
        if (value) headers.append(key, String(value));
      });

      const req = new Request(url.toString(), {
        method: request.method,
        headers,
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      });

      const response = await auth.handler(req);

      reply.status(response.status);
      response.headers.forEach((value: string, key: string) => reply.header(key, value));
      const text = await response.text();
      reply.send(text || null);
    } catch (error) {
      app.log.error('Auth error:', error);
      reply.status(500).send({ error: 'Internal auth error' });
    }
  },
});

// Serve built frontend in production
const distPath = path.join(__dirname, '..', 'dist');
import fs from 'node:fs';
if (fs.existsSync(distPath)) {
  await app.register(fastifyStatic, {
    root: distPath,
    prefix: '/',
    wildcard: false,
    setHeaders: (res: any, filePath: string) => {
      if (filePath.endsWith('index.html')) {
        // Never cache index.html — ensures browser always gets fresh chunk references after deploys
        res.setHeader('Cache-Control', 'no-cache');
      } else if (filePath.includes('/assets/') && /\-[a-f0-9]{8}\.(js|css)$/.test(filePath)) {
        // Immutable caching for Vite's hashed assets (e.g. index-12266eec.js)
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  });
  // SPA catch-all: serve index.html for non-API, non-file routes
  app.setNotFoundHandler((request: any, reply: any) => {
    if (request.url.startsWith('/api/') || request.url.startsWith('/uploads/')) {
      reply.code(404).send({ error: 'Not found' });
    } else {
      reply.header('Cache-Control', 'no-cache').sendFile('index.html', distPath);
    }
  });
}

// Application routes
await app.register(settingRoutes, { prefix: '/api/settings' });
    await app.register(projectTypeRoutes, { prefix: '/api/project-types' });
    await app.register(projectRoleRoutes, { prefix: '/api/project-roles' });
await app.register(clientRoutes, { prefix: '/api/clients' });
await app.register(projectRoutes, { prefix: '/api/projects' });
await app.register(productRoutes, { prefix: '/api/products' });
await app.register(quoteRoutes, { prefix: '/api/quotes' });
await app.register(invoiceRoutes, { prefix: '/api/invoices' });
await app.register(paymentRoutes, { prefix: '/api/payments' });
await app.register(userRoutes, { prefix: '/api/users' });
await app.register(storageRoutes, { prefix: '/api/storage' });
await app.register(emailRoutes, { prefix: '/api/email' });
await app.register(pdfRoutes, { prefix: '/api/pdf' });
await app.register(oidcRoutes, { prefix: '/api/oidc' });
await app.register(googleRoutes, { prefix: '/api/google' });
await app.register(activityLogRoutes, { prefix: '/api/activity-log' });
await app.register(taxRatesRoutes, { prefix: '/api/tax-rates' });
await app.register(creditRoutes, { prefix: '/api/credits' });
await app.register(statsRoutes, { prefix: '/api/stats' });
await app.register(stripeRoutes, { prefix: '/api/stripe' });
await app.register(paypalRoutes, { prefix: '/api/paypal' });
await app.register(payRoutes, { prefix: '/api/pay' });
await app.register(approveRoutes, { prefix: '/api/approve' });
await app.register(teamRoutes, { prefix: '/api/team' });
await app.register(assignmentRoutes, { prefix: '/api/assignments' });
await app.register(teamPaymentRoutes, { prefix: '/api/team-payments' });
await app.register(teamAdvanceRoutes, { prefix: '/api/team-advances' });
await app.register(teamSalaryRoutes, { prefix: '/api/team-salary' });
await app.register(notificationRoutes, { prefix: '/api/notifications' });
await app.register(calendarRoutes, { prefix: '/api/calendar' });
await app.register(unsplashRoutes, { prefix: '/api/unsplash' });
await app.register(expenseCategoryRoutes, { prefix: '/api/expense-categories' });
await app.register(expenseRoutes, { prefix: '/api/expenses' });
await app.register(recurringExpenseRoutes, { prefix: '/api/recurring-expenses' });
await app.register(permissionRoutes, { prefix: '/api/permissions' });
await app.register(errorRoutes, { prefix: '/api/errors' });
await app.register(backupRoutes, { prefix: '/api/backup' });
await app.register(gdriveAuthRoutes, { prefix: '/api/backup/gdrive' });
await app.register(setupRoutes, { prefix: '/api/setup' });
await app.register(reportsRoutes, { prefix: '/api/reports' });
await app.register(hubRoutes, { prefix: '/api/hub' });
await app.register(sseRoutes, { prefix: '/api/sse' });

const port = parseInt(process.env.API_PORT || '3001', 10);
await app.listen({ port, host: '0.0.0.0' });
