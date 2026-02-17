import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import { db } from './db';
import * as schema from './db/schema';
import { count } from 'drizzle-orm';
import { SUPER_ADMIN_EMAIL } from './lib/permissions';
import {
  getSmtpSettings,
  createTransporter,
  buildFromAddress,
  getCompanySettings,
  buildVerificationEmailHtml,
} from './lib/mailer';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  basePath: '/api/auth',

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
    requireEmailVerification: true,
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: false,
    sendVerificationEmail: async ({ user, url }) => {
      try {
        // Rewrite callbackURL so the verifying device lands on a
        // confirmation page instead of auto-signing-in to the full app.
        // The originating device detects verification via polling and
        // signs in with stored credentials — no session needed here.
        const verifyUrl = new URL(url);
        verifyUrl.searchParams.set('callbackURL', '/?verified=true');
        const rewrittenUrl = verifyUrl.toString();

        const smtpSettings = await getSmtpSettings();
        if (!smtpSettings.smtp_host || smtpSettings.smtp_enabled === 'false') {
          console.warn('[Email Verification] SMTP not configured. Verification URL:', rewrittenUrl);
          return;
        }

        const companySettings = await getCompanySettings();
        const appName = companySettings.app_name || 'QuoteFlow';
        const companyName = companySettings.company_name || '';
        const accentColor = companySettings.accent_color || '#8b5cf6';

        const { html, subject } = buildVerificationEmailHtml({
          appName, companyName, accentColor,
          emailHeaderBgColor: companySettings.email_header_bg_color,
          emailAccentColor: companySettings.email_accent_color,
          emailHeaderTextColor: companySettings.email_header_text_color,
          verifyUrl: rewrittenUrl,
          subjectTemplate: companySettings.verification_email_subject,
          bodyTemplate: companySettings.verification_email_body,
        });
        const transporter = createTransporter(smtpSettings);

        await transporter.sendMail({
          from: buildFromAddress(smtpSettings),
          to: user.email,
          subject,
          html,
        });
      } catch (err: any) {
        console.error('[Email Verification] Failed to send:', err.message);
      }
    },
  },

  plugins: [
    admin(),
    passkey({
      rpID: process.env.PASSKEY_RP_ID || 'localhost',
      rpName: process.env.PASSKEY_RP_NAME || 'Madrid Photography',
      origin: process.env.BETTER_AUTH_URL || 'http://localhost:3002',
    }),
  ],

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh daily
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },

  user: {
    additionalFields: {},
  },

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // First user ever gets admin role; all others get 'user'
          const [{ total }] = await db.select({ total: count() }).from(schema.profiles);
          const isFirstUser = total === 0;
          const role = isFirstUser ? 'admin' : 'user';

          // Auto-approve: first user (admin), super admin email
          const approved = isFirstUser || user.email === SUPER_ADMIN_EMAIL;

          await db.insert(schema.profiles).values({
            id: user.id,
            email: user.email,
            displayName: user.name || user.email,
            role: isFirstUser ? 'admin' : (user.email === SUPER_ADMIN_EMAIL ? 'admin' : 'user'),
            approved,
            createdAt: new Date(),
            updatedAt: new Date(),
          }).onConflictDoNothing();
        },
      },
    },
  },
});
