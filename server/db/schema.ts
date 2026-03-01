import { pgTable, pgEnum, text, boolean, timestamp, doublePrecision, numeric, integer, uniqueIndex, index, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ── Enums (matching existing PG enum names created by Prisma) ──
export const userRoleEnum = pgEnum('UserRole', ['admin', 'user']);
export const productTypeEnum = pgEnum('ProductType', ['product', 'service']);
export const discountTypeEnum = pgEnum('DiscountType', ['percent', 'fixed']);
export const invoiceStatusEnum = pgEnum('InvoiceStatus', ['pending', 'partial', 'paid']);
export const deliveryStatusEnum = pgEnum('DeliveryStatus', ['scheduled', 'in_editing', 'delivered']);

export const projectStatusEnum = pgEnum('ProjectStatus', ['lead', 'booked', 'shooting', 'editing', 'delivered', 'completed', 'archived']);
// Note: PG enum still has legacy values (lead_photographer, lead_videographer, second_shooter) but only these 4 are used
export const teamRoleEnum = pgEnum('TeamRole', ['owner', 'manager', 'lead', 'lead_photographer', 'lead_videographer', 'second_shooter', 'crew']);
export const teamPaymentStatusEnum = pgEnum('TeamPaymentStatus', ['pending', 'paid']);
export const recurringFrequencyEnum = pgEnum('RecurringFrequency', ['weekly', 'monthly', 'yearly']);
export const expenseTypeEnum = pgEnum('ExpenseType', ['expense', 'credit']);
export const backupStatusEnum = pgEnum('BackupStatus', ['pending', 'running', 'completed', 'partial', 'failed']);
export const backupUploadStatusEnum = pgEnum('BackupUploadStatus', ['pending', 'uploading', 'completed', 'failed']);
export const hubPostTypeEnum = pgEnum('hub_post_type', ['idea', 'task', 'announcement']);

// ── Better Auth managed tables ──

export const user = pgTable('user', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  role: text('role').default('user'),
  banned: boolean('banned').default(false),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires', { withTimezone: true, mode: 'date' }),
}, (table) => [
  index('user_role_idx').on(table.role),
]);

export const session = pgTable('session', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  impersonatedBy: text('impersonated_by'),
}, (table) => [
  index('session_expires_at_idx').on(table.expiresAt),
  index('session_impersonated_by_idx').on(table.impersonatedBy),
]);

export const account = pgTable('account', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true, mode: 'date' }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true, mode: 'date' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('account_user_id_provider_id_idx').on(table.userId, table.providerId),
]);

export const verification = pgTable('verification', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('verification_identifier_idx').on(table.identifier),
  index('verification_expires_at_idx').on(table.expiresAt),
]);

export const passkey = pgTable('passkey', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  publicKey: text('public_key').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  credentialID: text('credential_i_d').notNull(),
  counter: integer('counter').notNull(),
  deviceType: text('device_type').notNull(),
  backedUp: boolean('backed_up').notNull(),
  transports: text('transports'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow(),
  aaguid: text('aaguid'),
}, (table) => [
  index('passkey_user_id_idx').on(table.userId),
  index('passkey_credential_id_idx').on(table.credentialID),
]);

// ── Application tables ──

export const profiles = pgTable('profiles', {
  id: text('id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  avatarUrl: text('avatar_url'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  displayName: text('display_name'),
  phone: text('phone'),
  website: text('website'),
  email: text('email'),
  role: userRoleEnum('role').notNull().default('user'),
  approved: boolean('approved').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('profiles_role_idx').on(table.role),
  index('profiles_approved_idx').on(table.approved),
]);

export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  lastEditedBy: text('last_edited_by'),
});

export const projectRoles = pgTable('project_roles', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  label: text('label').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const projectTypes = pgTable('project_types', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  slug: text('slug').notNull().unique(),
  label: text('label').notNull(),
  color: text('color').notNull().default('amber'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const clients = pgTable('clients', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  displayName: text('display_name'),
  firstName: text('first_name').notNull(),
  lastName: text('last_name'),
  email: text('email'),
  phone: text('phone'),
  phone2: text('phone2'),
  company: text('company'),
  billingStreet: text('billing_street'),
  billingCity: text('billing_city'),
  billingState: text('billing_state'),
  billingPostalCode: text('billing_postal_code'),
  billingCountry: text('billing_country'),
  shippingStreet: text('shipping_street'),
  shippingCity: text('shipping_city'),
  shippingState: text('shipping_state'),
  shippingPostalCode: text('shipping_postal_code'),
  shippingCountry: text('shipping_country'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('clients_user_id_email_key').on(table.userId, table.email),
  index('clients_user_id_idx').on(table.userId),
  index('clients_last_name_first_name_idx').on(table.lastName, table.firstName),
]);

export const products = pgTable('products', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  retailPrice: numeric('retail_price', { precision: 12, scale: 2, mode: 'number' }).notNull(),
  cost: numeric('cost', { precision: 12, scale: 2, mode: 'number' }),
  description: text('description'),
  category: text('category'),
  productType: productTypeEnum('product_type').notNull().default('product'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('products_user_id_idx').on(table.userId),
  index('products_product_type_idx').on(table.productType),
  index('products_category_idx').on(table.category),
]);

export const projects = pgTable('projects', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  clientId: text('client_id').references(() => clients.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description'),
  projectType: text('project_type'),
  projectTypeId: text('project_type_id').references(() => projectTypes.id, { onDelete: 'set null' }),
  status: projectStatusEnum('status').notNull().default('lead'),
  shootStartDate: timestamp('shoot_start_date', { withTimezone: true, mode: 'date' }),
  shootEndDate: timestamp('shoot_end_date', { withTimezone: true, mode: 'date' }),
  shootStartTime: text('shoot_start_time'),
  shootEndTime: text('shoot_end_time'),
  deliveryDate: timestamp('delivery_date', { withTimezone: true, mode: 'date' }),
  location: text('location'),
  addressStreet: text('address_street'),
  addressCity: text('address_city'),
  addressState: text('address_state'),
  addressZip: text('address_zip'),
  placeId: text('place_id'),
  coverPhotoUrl: text('cover_photo_url'),
  teamCost: numeric('team_cost', { precision: 12, scale: 2, mode: 'number' }).default(0),
  teamCostPaid: numeric('team_cost_paid', { precision: 12, scale: 2, mode: 'number' }).default(0),
  margin: numeric('margin', { precision: 12, scale: 2, mode: 'number' }),
  projectPrice: numeric('project_price', { precision: 12, scale: 2, mode: 'number' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('projects_user_id_idx').on(table.userId),
  index('projects_client_id_idx').on(table.clientId),
  index('projects_status_idx').on(table.status),
  index('projects_shoot_start_date_idx').on(table.shootStartDate),
  index('projects_project_type_id_idx').on(table.projectTypeId),
]);

export const quotes = pgTable('quotes', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  quoteNumber: integer('quote_number').notNull(),
  clientId: text('client_id').references(() => clients.id, { onDelete: 'set null' }),
  clientName: text('client_name'),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
  subtotal: numeric('subtotal', { precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
  tax: numeric('tax', { precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
  taxRate: numeric('tax_rate', { precision: 5, scale: 3, mode: 'number' }).notNull().default(0),
  total: numeric('total', { precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
  discountType: discountTypeEnum('discount_type'),
  discountValue: numeric('discount_value', { precision: 12, scale: 2, mode: 'number' }),
  discountAmount: numeric('discount_amount', { precision: 12, scale: 2, mode: 'number' }),
  notes: text('notes'),
  eventDate: timestamp('event_date', { withTimezone: true, mode: 'date' }),
  eventEndDate: timestamp('event_end_date', { withTimezone: true, mode: 'date' }),
  eventLocation: text('event_location'),
  eventType: text('event_type'),
  projectTypeId: text('project_type_id').references(() => projectTypes.id, { onDelete: 'set null' }),
  terms: text('terms'),
  approvalToken: text('approval_token').unique(),
  approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'date' }),
  createdBy: text('created_by'),
  lastEditedBy: text('last_edited_by'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('quotes_user_id_idx').on(table.userId),
  index('quotes_client_id_idx').on(table.clientId),
  index('quotes_project_id_idx').on(table.projectId),
  index('quotes_quote_number_idx').on(table.quoteNumber),
  index('quotes_event_date_idx').on(table.eventDate),
  index('quotes_project_type_id_idx').on(table.projectTypeId),
  index('quotes_approved_at_idx').on(table.approvedAt),
]);

export const invoices = pgTable('invoices', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  invoiceNumber: integer('invoice_number').notNull(),
  quoteId: text('quote_id').references(() => quotes.id, { onDelete: 'set null' }),
  clientId: text('client_id').references(() => clients.id, { onDelete: 'set null' }),
  clientName: text('client_name'),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
  subtotal: numeric('subtotal', { precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
  tax: numeric('tax', { precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
  taxRate: numeric('tax_rate', { precision: 5, scale: 3, mode: 'number' }).notNull().default(0),
  total: numeric('total', { precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
  discountType: discountTypeEnum('discount_type'),
  discountValue: numeric('discount_value', { precision: 12, scale: 2, mode: 'number' }),
  discountAmount: numeric('discount_amount', { precision: 12, scale: 2, mode: 'number' }),
  notes: text('notes'),
  eventDate: timestamp('event_date', { withTimezone: true, mode: 'date' }),
  eventEndDate: timestamp('event_end_date', { withTimezone: true, mode: 'date' }),
  eventLocation: text('event_location'),
  eventType: text('event_type'),
  projectTypeId: text('project_type_id').references(() => projectTypes.id, { onDelete: 'set null' }),
  terms: text('terms'),
  deliveryStatus: deliveryStatusEnum('delivery_status'),
  depositAmount: numeric('deposit_amount', { precision: 12, scale: 2, mode: 'number' }),
  status: invoiceStatusEnum('status').notNull().default('pending'),
  paidAmount: numeric('paid_amount', { precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
  dueDate: timestamp('due_date', { withTimezone: true, mode: 'date' }),
  paymentToken: text('payment_token').unique(),
  createdBy: text('created_by'),
  lastEditedBy: text('last_edited_by'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('invoices_user_id_idx').on(table.userId),
  index('invoices_client_id_idx').on(table.clientId),
  index('invoices_project_id_idx').on(table.projectId),
  index('invoices_invoice_number_idx').on(table.invoiceNumber),
  index('invoices_event_date_idx').on(table.eventDate),
  index('invoices_project_type_id_idx').on(table.projectTypeId),
  index('invoices_status_idx').on(table.status),
  index('invoices_due_date_idx').on(table.dueDate),
  index('invoices_quote_id_idx').on(table.quoteId),
]);

export const payments = pgTable('payments', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  invoiceId: text('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  amount: numeric('amount', { precision: 12, scale: 2, mode: 'number' }).notNull(),
  method: text('method').notNull().default('Cash'),
  paymentDate: timestamp('payment_date', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  stripeRefundedAmount: numeric('stripe_refunded_amount', { precision: 12, scale: 2, mode: 'number' }).default(0),
  paypalOrderId: text('paypal_order_id'),
}, (table) => [
  index('payments_invoice_id_idx').on(table.invoiceId),
  index('payments_stripe_pi_idx').on(table.stripePaymentIntentId),
  index('payments_paypal_order_idx').on(table.paypalOrderId),
]);

export const pdfDocuments = pgTable('pdf_documents', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  token: text('token').notNull().unique(),
  fileName: text('file_name').notNull(),
  documentType: text('document_type').notNull(),
  documentId: text('document_id').notNull(),
  documentNumber: integer('document_number').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
}, (table) => [
  index('pdf_documents_document_type_document_id_idx').on(table.documentType, table.documentId),
  index('pdf_documents_expires_at_idx').on(table.expiresAt),
]);

// ── Line item tables ──

export const quoteItems = pgTable('quote_items', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  quoteId: text('quote_id').notNull().references(() => quotes.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
  itemType: text('item_type').notNull(), // 'product' | 'custom'
  name: text('name').notNull(),
  description: text('description'),
  qty: integer('qty').notNull().default(1),
  total: numeric('total', { precision: 12, scale: 2, mode: 'number' }).notNull(),
  isTaxable: boolean('is_taxable').notNull().default(false),
  productId: text('product_id').references(() => products.id, { onDelete: 'set null' }),
  productType: productTypeEnum('product_type'),
  price: numeric('price', { precision: 12, scale: 2, mode: 'number' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('quote_items_quote_id_idx').on(table.quoteId),
  index('quote_items_quote_id_sort_order_idx').on(table.quoteId, table.sortOrder),
  index('quote_items_product_id_idx').on(table.productId),
]);

export const invoiceItems = pgTable('invoice_items', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  invoiceId: text('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
  itemType: text('item_type').notNull(), // 'product' | 'custom'
  name: text('name').notNull(),
  description: text('description'),
  qty: integer('qty').notNull().default(1),
  total: numeric('total', { precision: 12, scale: 2, mode: 'number' }).notNull(),
  isTaxable: boolean('is_taxable').notNull().default(false),
  productId: text('product_id').references(() => products.id, { onDelete: 'set null' }),
  productType: productTypeEnum('product_type'),
  price: numeric('price', { precision: 12, scale: 2, mode: 'number' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('invoice_items_invoice_id_idx').on(table.invoiceId),
  index('invoice_items_invoice_id_sort_order_idx').on(table.invoiceId, table.sortOrder),
  index('invoice_items_product_id_idx').on(table.productId),
]);

// ── Activity log ──

export const activityLog = pgTable('activity_log', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  userDisplayName: text('user_display_name').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  entityLabel: text('entity_label'),
  details: text('details'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('activity_log_created_at_idx').on(table.createdAt),
  index('activity_log_entity_type_idx').on(table.entityType),
  index('activity_log_user_id_idx').on(table.userId),
]);

// ── Client notes ──

export const clientNotes = pgTable('client_notes', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  clientId: text('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('client_notes_client_id_idx').on(table.clientId),
]);

// ── Project notes ──

export const projectNotes = pgTable('project_notes', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  createdBy: text('created_by').notNull(),
  userId: text('user_id'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }),
}, (table) => [
  index('project_notes_project_id_idx').on(table.projectId),
  index('project_notes_user_id_idx').on(table.userId),
]);

// ── Project sessions (non-consecutive shoot dates) ──

export const projectSessions = pgTable('project_sessions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  label: text('label'),
  sessionDate: timestamp('session_date', { withTimezone: true, mode: 'date' }).notNull(),
  startTime: text('start_time'),
  endTime: text('end_time'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('project_sessions_project_id_idx').on(table.projectId),
]);

// ── Project documents (uploaded files for record keeping) ──

export const projectDocuments = pgTable('project_documents', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  originalName: text('original_name').notNull(),
  mimeType: text('mime_type').notNull(),
  fileSize: integer('file_size').notNull(),
  uploadedBy: text('uploaded_by'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('project_documents_project_id_idx').on(table.projectId),
]);

// ── Client credits ──

export const clientCredits = pgTable('client_credits', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  clientId: text('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  amount: numeric('amount', { precision: 12, scale: 2, mode: 'number' }).notNull(),
  reason: text('reason'),
  sourceInvoiceNumber: integer('source_invoice_number'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('client_credits_client_id_idx').on(table.clientId),
]);

// ── Notifications ──

export const notifications = pgTable('notifications', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('notifications_user_id_idx').on(table.userId),
  index('notifications_user_id_is_read_idx').on(table.userId, table.isRead),
  index('notifications_created_at_idx').on(table.createdAt),
]);

// ── Team ──

export const teamMembers = pgTable('team_members', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  name: text('name'),
  role: teamRoleEnum('role').notNull(),
  paymentMethod: text('payment_method'),
  isActive: boolean('is_active').notNull().default(true),
  notes: text('notes'),
  advancesEnabled: boolean('advances_enabled').notNull().default(false),
  salaryEnabled: boolean('salary_enabled').notNull().default(false),
  weeklySalary: numeric('weekly_salary', { precision: 12, scale: 2, mode: 'number' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('team_members_user_id_idx').on(table.userId),
  index('team_members_role_idx').on(table.role),
  index('team_members_is_active_idx').on(table.isActive),
]);

export const projectAssignments = pgTable('project_assignments', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  teamMemberId: text('team_member_id').notNull().references(() => teamMembers.id, { onDelete: 'cascade' }),
  role: text('role'),
  hoursWorked: doublePrecision('hours_worked'),
  daysWorked: doublePrecision('days_worked'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('project_assignments_project_id_idx').on(table.projectId),
  index('project_assignments_team_member_id_idx').on(table.teamMemberId),
  uniqueIndex('project_assignments_project_team_unique').on(table.projectId, table.teamMemberId),
]);

export const teamPayments = pgTable('team_payments', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  teamMemberId: text('team_member_id').notNull().references(() => teamMembers.id, { onDelete: 'cascade' }),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
  amount: numeric('amount', { precision: 12, scale: 2, mode: 'number' }).notNull(),
  paymentDate: timestamp('payment_date', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  paymentMethod: text('payment_method'),
  status: teamPaymentStatusEnum('status').notNull().default('pending'),
  notes: text('notes'),
  paidBy: text('paid_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('team_payments_team_member_id_idx').on(table.teamMemberId),
  index('team_payments_project_id_idx').on(table.projectId),
  index('team_payments_status_idx').on(table.status),
  index('team_payments_payment_date_idx').on(table.paymentDate),
]);

export const teamAdvances = pgTable('team_advances', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  teamMemberId: text('team_member_id').notNull().references(() => teamMembers.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'advance' | 'repayment'
  amount: numeric('amount', { precision: 12, scale: 2, mode: 'number' }).notNull(),
  description: text('description').notNull(),
  advanceDate: timestamp('advance_date', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  teamPaymentId: text('team_payment_id').references(() => teamPayments.id, { onDelete: 'set null' }),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('team_advances_team_member_id_idx').on(table.teamMemberId),
  index('team_advances_type_idx').on(table.type),
  index('team_advances_advance_date_idx').on(table.advanceDate),
  index('team_advances_team_payment_id_idx').on(table.teamPaymentId),
]);

export const teamSalary = pgTable('team_salary', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  teamMemberId: text('team_member_id').notNull().references(() => teamMembers.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'accrued' | 'paid'
  amount: numeric('amount', { precision: 12, scale: 2, mode: 'number' }).notNull(),
  description: text('description'),
  entryDate: timestamp('entry_date', { withTimezone: true, mode: 'date' }).notNull(),
  periodStart: timestamp('period_start', { withTimezone: true, mode: 'date' }),
  periodEnd: timestamp('period_end', { withTimezone: true, mode: 'date' }),
  teamPaymentId: text('team_payment_id').references(() => teamPayments.id, { onDelete: 'set null' }),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('team_salary_member_idx').on(table.teamMemberId),
  index('team_salary_type_idx').on(table.type),
  index('team_salary_date_idx').on(table.entryDate),
]);

// ── Expenses ──

export const expenseCategories = pgTable('expense_categories', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  color: text('color'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('expense_categories_user_id_idx').on(table.userId),
]);

export const vendors = pgTable('vendors', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('vendors_user_id_idx').on(table.userId),
]);

export const expenses = pgTable('expenses', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
  categoryId: text('category_id').references(() => expenseCategories.id, { onDelete: 'set null' }),
  description: text('description').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2, mode: 'number' }).notNull(),
  type: expenseTypeEnum('type').notNull().default('expense'),
  expenseDate: timestamp('expense_date', { withTimezone: true, mode: 'date' }).notNull(),
  vendorId: text('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
  notes: text('notes'),
  recurringExpenseId: text('recurring_expense_id').references(() => recurringExpenses.id, { onDelete: 'set null' }),
  teamPaymentId: text('team_payment_id').references(() => teamPayments.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('expenses_user_id_idx').on(table.userId),
  index('expenses_project_id_idx').on(table.projectId),
  index('expenses_category_id_idx').on(table.categoryId),
  index('expenses_vendor_id_idx').on(table.vendorId),
  index('expenses_expense_date_idx').on(table.expenseDate),
  index('expenses_recurring_expense_id_idx').on(table.recurringExpenseId),
  index('expenses_team_payment_id_idx').on(table.teamPaymentId),
]);

export const recurringExpenses = pgTable('recurring_expenses', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  categoryId: text('category_id').references(() => expenseCategories.id, { onDelete: 'set null' }),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
  description: text('description').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2, mode: 'number' }).notNull(),
  vendorId: text('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
  notes: text('notes'),
  frequency: recurringFrequencyEnum('frequency').notNull().default('monthly'),
  startDate: timestamp('start_date', { withTimezone: true, mode: 'date' }).notNull(),
  nextDueDate: timestamp('next_due_date', { withTimezone: true, mode: 'date' }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true, mode: 'date' }),
  isActive: boolean('is_active').notNull().default(true),
  lastGeneratedDate: timestamp('last_generated_date', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('recurring_expenses_user_id_idx').on(table.userId),
  index('recurring_expenses_next_due_date_idx').on(table.nextDueDate),
  index('recurring_expenses_is_active_idx').on(table.isActive),
]);

// ── Permissions ──

export const rolePermissions = pgTable('role_permissions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  role: teamRoleEnum('role').notNull(),
  permission: text('permission').notNull(),
  granted: boolean('granted').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('role_permissions_role_permission_key').on(table.role, table.permission),
]);

export const userPermissionOverrides = pgTable('user_permission_overrides', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  permission: text('permission').notNull(),
  granted: boolean('granted').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('user_permission_overrides_user_permission_key').on(table.userId, table.permission),
  index('user_permission_overrides_user_id_idx').on(table.userId),
]);

// ── Backups ──

export const backups = pgTable('backups', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  provider: text('provider').notNull(),
  status: backupStatusEnum('status').notNull().default('pending'),
  fileName: text('file_name'),
  fileSize: doublePrecision('file_size'),
  manifest: text('manifest'),
  errorMessage: text('error_message'),
  triggeredBy: text('triggered_by'),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
  completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('backups_status_idx').on(table.status),
  index('backups_created_at_idx').on(table.createdAt),
]);

export const backupDestinations = pgTable('backup_destinations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  provider: text('provider').notNull(),
  credentials: jsonb('credentials').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('backup_destinations_is_active_idx').on(table.isActive),
]);

export const backupUploads = pgTable('backup_uploads', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  backupId: text('backup_id').notNull().references(() => backups.id, { onDelete: 'cascade' }),
  destinationId: text('destination_id').notNull().references(() => backupDestinations.id, { onDelete: 'cascade' }),
  status: backupUploadStatusEnum('status').notNull().default('pending'),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
  completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
}, (table) => [
  index('backup_uploads_backup_id_idx').on(table.backupId),
  index('backup_uploads_destination_id_idx').on(table.destinationId),
]);

// ── Team Hub ──

export const hubPosts = pgTable('hub_posts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  authorId: text('author_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  type: hubPostTypeEnum('type').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  pinned: boolean('pinned').notNull().default(false),
  assigneeIds: jsonb('assignee_ids').notNull().default([]),
  assignedToAll: boolean('assigned_to_all').notNull().default(false),
  completed: boolean('completed').notNull().default(false),
  completedBy: jsonb('completed_by').notNull().default([]),
  thumbsUpIds: jsonb('thumbs_up_ids').notNull().default([]),
  thumbsDownIds: jsonb('thumbs_down_ids').notNull().default([]),
  dueDate: timestamp('due_date', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('hub_posts_author_id_idx').on(table.authorId),
  index('hub_posts_type_idx').on(table.type),
  index('hub_posts_pinned_idx').on(table.pinned),
  index('hub_posts_created_at_idx').on(table.createdAt),
  index('hub_posts_assignee_ids_idx').on(table.assigneeIds),
]);

export const hubComments = pgTable('hub_comments', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  postId: text('post_id').notNull().references(() => hubPosts.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('hub_comments_post_id_idx').on(table.postId),
  index('hub_comments_author_id_idx').on(table.authorId),
]);

// ── Relations ──

export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  profile: one(profiles, { fields: [user.id], references: [profiles.id] }),
  teamMember: one(teamMembers, { fields: [user.id], references: [teamMembers.userId] }),
  notifications: many(notifications),
  hubPosts: many(hubPosts),
  hubComments: many(hubComments),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const profileRelations = relations(profiles, ({ one }) => ({
  user: one(user, { fields: [profiles.id], references: [user.id] }),
}));

export const clientRelations = relations(clients, ({ many }) => ({
  quotes: many(quotes),
  invoices: many(invoices),
  projects: many(projects),
  notes: many(clientNotes),
  credits: many(clientCredits),
}));

export const clientNoteRelations = relations(clientNotes, ({ one }) => ({
  client: one(clients, { fields: [clientNotes.clientId], references: [clients.id] }),
}));

export const projectTypeRelations = relations(projectTypes, ({ many }) => ({
  projects: many(projects),
  quotes: many(quotes),
  invoices: many(invoices),
}));

export const projectRelations = relations(projects, ({ one, many }) => ({
  client: one(clients, { fields: [projects.clientId], references: [clients.id] }),
  projectTypeRel: one(projectTypes, { fields: [projects.projectTypeId], references: [projectTypes.id] }),
  quotes: many(quotes),
  invoices: many(invoices),
  notes: many(projectNotes),
  assignments: many(projectAssignments),
  teamPayments: many(teamPayments),
  expenses: many(expenses),
  recurringExpenses: many(recurringExpenses),
  sessions: many(projectSessions),
  documents: many(projectDocuments),
}));

export const projectNoteRelations = relations(projectNotes, ({ one }) => ({
  project: one(projects, { fields: [projectNotes.projectId], references: [projects.id] }),
}));

export const projectSessionRelations = relations(projectSessions, ({ one }) => ({
  project: one(projects, { fields: [projectSessions.projectId], references: [projects.id] }),
}));

export const projectDocumentRelations = relations(projectDocuments, ({ one }) => ({
  project: one(projects, { fields: [projectDocuments.projectId], references: [projects.id] }),
}));

export const quoteRelations = relations(quotes, ({ one, many }) => ({
  client: one(clients, { fields: [quotes.clientId], references: [clients.id] }),
  project: one(projects, { fields: [quotes.projectId], references: [projects.id] }),
  projectTypeRel: one(projectTypes, { fields: [quotes.projectTypeId], references: [projectTypes.id] }),
  invoices: many(invoices),
  items: many(quoteItems),
}));

export const invoiceRelations = relations(invoices, ({ one, many }) => ({
  client: one(clients, { fields: [invoices.clientId], references: [clients.id] }),
  quote: one(quotes, { fields: [invoices.quoteId], references: [quotes.id] }),
  project: one(projects, { fields: [invoices.projectId], references: [projects.id] }),
  projectTypeRel: one(projectTypes, { fields: [invoices.projectTypeId], references: [projectTypes.id] }),
  payments: many(payments),
  items: many(invoiceItems),
}));

export const paymentRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, { fields: [payments.invoiceId], references: [invoices.id] }),
}));

export const quoteItemRelations = relations(quoteItems, ({ one }) => ({
  quote: one(quotes, { fields: [quoteItems.quoteId], references: [quotes.id] }),
  product: one(products, { fields: [quoteItems.productId], references: [products.id] }),
}));

export const invoiceItemRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceItems.invoiceId], references: [invoices.id] }),
  product: one(products, { fields: [invoiceItems.productId], references: [products.id] }),
}));

export const clientCreditRelations = relations(clientCredits, ({ one }) => ({
  client: one(clients, { fields: [clientCredits.clientId], references: [clients.id] }),
}));

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  user: one(user, { fields: [activityLog.userId], references: [user.id] }),
}));

export const notificationRelations = relations(notifications, ({ one }) => ({
  user: one(user, { fields: [notifications.userId], references: [user.id] }),
}));

export const teamMemberRelations = relations(teamMembers, ({ one, many }) => ({
  user: one(user, { fields: [teamMembers.userId], references: [user.id] }),
  assignments: many(projectAssignments),
  payments: many(teamPayments),
  advances: many(teamAdvances),
  salaryEntries: many(teamSalary),
}));

export const projectAssignmentRelations = relations(projectAssignments, ({ one }) => ({
  project: one(projects, { fields: [projectAssignments.projectId], references: [projects.id] }),
  teamMember: one(teamMembers, { fields: [projectAssignments.teamMemberId], references: [teamMembers.id] }),
}));

export const teamPaymentRelations = relations(teamPayments, ({ one }) => ({
  teamMember: one(teamMembers, { fields: [teamPayments.teamMemberId], references: [teamMembers.id] }),
  project: one(projects, { fields: [teamPayments.projectId], references: [projects.id] }),
  paidByUser: one(user, { fields: [teamPayments.paidBy], references: [user.id] }),
}));

export const teamAdvanceRelations = relations(teamAdvances, ({ one }) => ({
  teamMember: one(teamMembers, { fields: [teamAdvances.teamMemberId], references: [teamMembers.id] }),
  teamPayment: one(teamPayments, { fields: [teamAdvances.teamPaymentId], references: [teamPayments.id] }),
  createdByUser: one(user, { fields: [teamAdvances.createdBy], references: [user.id] }),
}));

export const teamSalaryRelations = relations(teamSalary, ({ one }) => ({
  teamMember: one(teamMembers, { fields: [teamSalary.teamMemberId], references: [teamMembers.id] }),
  teamPayment: one(teamPayments, { fields: [teamSalary.teamPaymentId], references: [teamPayments.id] }),
  createdByUser: one(user, { fields: [teamSalary.createdBy], references: [user.id] }),
}));

export const expenseCategoryRelations = relations(expenseCategories, ({ many }) => ({
  expenses: many(expenses),
  recurringExpenses: many(recurringExpenses),
}));

export const vendorRelations = relations(vendors, ({ many }) => ({
  expenses: many(expenses),
  recurringExpenses: many(recurringExpenses),
}));

export const expenseRelations = relations(expenses, ({ one }) => ({
  project: one(projects, { fields: [expenses.projectId], references: [projects.id] }),
  category: one(expenseCategories, { fields: [expenses.categoryId], references: [expenseCategories.id] }),
  vendor: one(vendors, { fields: [expenses.vendorId], references: [vendors.id] }),
  recurringExpense: one(recurringExpenses, { fields: [expenses.recurringExpenseId], references: [recurringExpenses.id] }),
  teamPayment: one(teamPayments, { fields: [expenses.teamPaymentId], references: [teamPayments.id] }),
}));

export const recurringExpenseRelations = relations(recurringExpenses, ({ one }) => ({
  project: one(projects, { fields: [recurringExpenses.projectId], references: [projects.id] }),
  category: one(expenseCategories, { fields: [recurringExpenses.categoryId], references: [expenseCategories.id] }),
  vendor: one(vendors, { fields: [recurringExpenses.vendorId], references: [vendors.id] }),
}));

export const userPermissionOverrideRelations = relations(userPermissionOverrides, ({ one }) => ({
  user: one(user, { fields: [userPermissionOverrides.userId], references: [user.id] }),
}));

export const backupRelations = relations(backups, ({ one, many }) => ({
  user: one(user, { fields: [backups.userId], references: [user.id] }),
  uploads: many(backupUploads),
}));

export const backupUploadRelations = relations(backupUploads, ({ one }) => ({
  backup: one(backups, { fields: [backupUploads.backupId], references: [backups.id] }),
  destination: one(backupDestinations, { fields: [backupUploads.destinationId], references: [backupDestinations.id] }),
}));

export const hubPostRelations = relations(hubPosts, ({ one, many }) => ({
  author: one(user, { fields: [hubPosts.authorId], references: [user.id] }),
  comments: many(hubComments),
}));

export const hubCommentRelations = relations(hubComments, ({ one }) => ({
  post: one(hubPosts, { fields: [hubComments.postId], references: [hubPosts.id] }),
  author: one(user, { fields: [hubComments.authorId], references: [user.id] }),
}));
