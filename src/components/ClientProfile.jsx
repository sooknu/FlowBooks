import React, { useState, useMemo, useCallback } from 'react';
import { useTabScroll } from '@/hooks/useTabScroll';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import api from '@/lib/apiClient';
import { toast } from '@/components/ui/use-toast';
import { cn, fmtDate, fmtTime, tzDate, formatPhoneNumber } from '@/lib/utils';
import {
  useUpdateClient, useDeleteClient, useCreateClientNote, useDeleteClientNote,
  useDeleteQuote, useDeleteInvoice, useDeletePayment, useDeleteCredit,
} from '@/hooks/useMutations';
import {
  ChevronLeft, ChevronRight, ChevronDown, Mail, Phone, Building2, Plus, Trash2, Edit2,
  FileText, Receipt, CreditCard, FolderKanban, Calendar, Clock,
  StickyNote, Copy, Loader2, Send, MapPin, Filter, X, Gift, Undo2,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { US_STATE_NAMES } from '@/lib/usStateTaxRates';

const formatCurrency = (amount) => '$' + (parseFloat(amount) || 0).toFixed(2);

const formatDocNumber = (num) => '#' + String(num).padStart(5, '0');

const formatAddress = (prefix, data) => {
  if (!data) return '';
  const parts = [
    data[`${prefix}Street`],
    [data[`${prefix}City`], data[`${prefix}State`], data[`${prefix}PostalCode`]].filter(Boolean).join(', '),
    data[`${prefix}Country`],
  ].filter(Boolean);
  return parts.join(', ');
};

const statusColors = {
  paid: 'chip--success',
  partial: 'chip--warning',
  pending: 'chip--danger',
};

const TABS = [
  { key: 'transactions', label: 'Transactions', icon: Receipt },
  { key: 'projects', label: 'Projects', icon: FolderKanban },
  { key: 'profile', label: 'Profile', icon: Edit2 },
  { key: 'notes', label: 'Notes', icon: StickyNote },
];

const PROJECT_STATUS_COLORS = {
  lead: 'text-surface-500', booked: 'text-blue-400', shooting: 'text-rose-400',
  editing: 'text-amber-400', delivered: 'text-emerald-400', completed: 'text-emerald-400',
  archived: 'text-surface-400',
};

// ── Financial Summary Card ──────────────────────────────────────────────────

const subtleCard = 'rounded-xl border border-surface-200/60 bg-[rgb(var(--glass-bg))]';

const FinancialCard = ({ label, value, accent, delay }) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
    className={cn(subtleCard, 'p-4')}
  >
    <p className="text-xs text-surface-400 mb-1">{label}</p>
    <p className={cn('text-xl font-bold tabular-nums tracking-tight', accent)}>{value}</p>
  </motion.div>
);

// ── Date filter helpers ──────────────────────────────────────────────────────

function getDateRange(key) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (key) {
    case 'today':
      return { start: today, end: now };
    case 'this_week': {
      const day = today.getDay();
      const start = new Date(today);
      start.setDate(today.getDate() - day);
      return { start, end: now };
    }
    case 'this_month':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { start, end };
    }
    case 'last_30':
      return { start: new Date(now.getTime() - 30 * 86400000), end: now };
    case 'last_quarter': {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      const start = new Date(now.getFullYear(), qMonth - 3, 1);
      const end = new Date(now.getFullYear(), qMonth, 0, 23, 59, 59);
      return { start, end };
    }
    case 'this_year':
      return { start: new Date(now.getFullYear(), 0, 1), end: now };
    default: {
      // Year key like "2025"
      const year = parseInt(key);
      if (!isNaN(year)) {
        return { start: new Date(year, 0, 1), end: new Date(year, 11, 31, 23, 59, 59) };
      }
      return null;
    }
  }
}

function buildYearOptions() {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear - 1; y >= currentYear - 6; y--) {
    years.push({ value: String(y), label: String(y) });
  }
  return years;
}

const DATE_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_30', label: 'Last 30 Days' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'this_year', label: 'This Year' },
  ...buildYearOptions(),
];

// ── Transactions Tab ────────────────────────────────────────────────────────

const TransactionsTab = ({ quotes, invoices, credits, navigate, client, clientId }) => {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { type, id, label }
  const [paymentAction, setPaymentAction] = useState(null); // { id, amount, label }

  const deleteQuote = useDeleteQuote();
  const deleteInvoice = useDeleteInvoice();
  const deletePayment = useDeletePayment();
  const deleteCredit = useDeleteCredit();

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    const { type, id } = deleteConfirm;
    try {
      if (type === 'quote') {
        await deleteQuote.mutateAsync(id);
        queryClient.invalidateQueries({ queryKey: queryKeys.quotes.byClient(clientId) });
      } else if (type === 'invoice') {
        const result = await api.delete('/invoices/' + id);
        queryClient.invalidateQueries({ queryKey: queryKeys.invoices.byClient(clientId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
        if (result.creditCreated) {
          queryClient.invalidateQueries({ queryKey: queryKeys.credits.byClient(clientId) });
          toast({ title: `Invoice deleted. $${result.creditAmount.toFixed(2)} credit created for this client.` });
        } else {
          toast({ title: 'Invoice deleted successfully!' });
        }
      } else if (type === 'credit') {
        await deleteCredit.mutateAsync(id);
        queryClient.invalidateQueries({ queryKey: queryKeys.credits.byClient(clientId) });
      }
    } catch { /* handled by mutations */ }
    setDeleteConfirm(null);
  };

  const handlePaymentAction = async (action) => {
    if (!paymentAction) return;
    const { id, amount, stripePaymentIntentId } = paymentAction;
    try {
      if (action === 'stripe_refund' && stripePaymentIntentId) {
        await api.post('/stripe/refund', { paymentId: id, amount });
        queryClient.invalidateQueries({ queryKey: queryKeys.invoices.byClient(clientId) });
        toast({ title: `${formatCurrency(amount)} refunded to card via Stripe.` });
      } else {
        await deletePayment.mutateAsync(id);
        queryClient.invalidateQueries({ queryKey: queryKeys.invoices.byClient(clientId) });

        if (action === 'credit') {
          await api.post('/credits', {
            clientId,
            amount,
            reason: `Payment deleted — converted to client credit`,
          });
          queryClient.invalidateQueries({ queryKey: queryKeys.credits.byClient(clientId) });
          toast({ title: `Payment removed. ${formatCurrency(amount)} added as client credit.` });
        } else if (action === 'refund') {
          toast({ title: `Payment removed. ${formatCurrency(amount)} marked as refunded.` });
        } else {
          toast({ title: 'Payment deleted successfully!' });
        }
      }
    } catch { /* handled by mutations */ }
    setPaymentAction(null);
  };

  const allPayments = useMemo(() => {
    const payments = [];
    for (const inv of (invoices || [])) {
      for (const p of (inv.payments || [])) {
        payments.push({ ...p, invoiceNumber: inv.invoiceNumber, invoiceId: inv.id });
      }
    }
    return payments.sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));
  }, [invoices]);

  const hasActiveFilters = typeFilter !== 'all' || statusFilter !== 'all' || dateFilter !== 'all';

  const clearFilters = () => {
    setTypeFilter('all');
    setStatusFilter('all');
    setDateFilter('all');
  };

  // Apply date filter to a date value
  const matchesDate = useCallback((dateVal) => {
    if (dateFilter === 'all') return true;
    if (!dateVal) return false;
    const range = getDateRange(dateFilter);
    if (!range) return true;
    const d = new Date(dateVal);
    return d >= range.start && d <= range.end;
  }, [dateFilter]);

  // Apply status filter to an invoice
  const matchesStatus = useCallback((item, itemType) => {
    if (statusFilter === 'all') return true;
    if (itemType === 'quote') {
      // Quotes don't have a status field, but we can treat them as "expired" if older than 30 days
      if (statusFilter === 'expired') {
        return new Date(item.createdAt) < new Date(Date.now() - 30 * 86400000);
      }
      return false; // Other statuses don't apply to quotes
    }
    if (itemType === 'invoice') {
      if (statusFilter === 'paid') return item.status === 'paid';
      if (statusFilter === 'partial') return item.status === 'partial';
      if (statusFilter === 'pending') return item.status === 'pending';
      if (statusFilter === 'overdue') {
        return item.status !== 'paid' && item.dueDate && new Date(item.dueDate) < new Date();
      }
      if (statusFilter === 'expired') return false; // "expired" doesn't apply to invoices
    }
    if (itemType === 'payment') return true; // Payments pass through status filter
    return true;
  }, [statusFilter]);

  // Filtered data
  const filteredQuotes = useMemo(() => {
    if (typeFilter !== 'all' && typeFilter !== 'quotes') return [];
    return (quotes || []).filter(q => matchesDate(q.createdAt) && matchesStatus(q, 'quote'));
  }, [quotes, typeFilter, matchesDate, matchesStatus]);

  const filteredInvoices = useMemo(() => {
    if (typeFilter !== 'all' && typeFilter !== 'invoices') return [];
    return (invoices || []).filter(i => matchesDate(i.createdAt) && matchesStatus(i, 'invoice'));
  }, [invoices, typeFilter, matchesDate, matchesStatus]);

  const filteredPayments = useMemo(() => {
    if (typeFilter !== 'all' && typeFilter !== 'payments') return [];
    return allPayments.filter(p => matchesDate(p.paymentDate) && matchesStatus(p, 'payment'));
  }, [allPayments, typeFilter, matchesDate, matchesStatus]);

  const filteredCredits = useMemo(() => {
    if (typeFilter !== 'all' && typeFilter !== 'credits') return [];
    return (credits || []).filter(c => matchesDate(c.createdAt));
  }, [credits, typeFilter, matchesDate]);

  const showQuotes = typeFilter === 'all' || typeFilter === 'quotes';
  const showInvoices = typeFilter === 'all' || typeFilter === 'invoices';
  const showPayments = typeFilter === 'all' || typeFilter === 'payments';
  const showCredits = typeFilter === 'all' || typeFilter === 'credits';

  return (
    <div className="space-y-4">
      {/* Filters + Actions */}
      <div className={cn(subtleCard, 'p-3 flex flex-col md:flex-row md:items-center gap-3')}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Filter className="w-4 h-4 text-surface-400 shrink-0 hidden md:block" />
          <div className="grid grid-cols-3 md:flex md:flex-1 gap-2 w-full">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="glass-select text-xs !py-1.5 !px-2.5 md:flex-1"
            >
              <option value="all">All Types</option>
              <option value="quotes">Quotes</option>
              <option value="invoices">Invoices</option>
              <option value="payments">Payments</option>
              <option value="credits">Credits</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="glass-select text-xs !py-1.5 !px-2.5 md:flex-1"
            >
              <option value="all">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
              <option value="expired">Expired (Quotes)</option>
            </select>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="glass-select text-xs !py-1.5 !px-2.5 md:flex-1"
            >
              {DATE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-xs text-surface-400 hover:text-surface-700 flex items-center gap-1 shrink-0 transition-colors">
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>
        <div className="flex gap-2 shrink-0 border-t border-border pt-3 md:border-t-0 md:pt-0 md:border-l md:pl-3">
          <button
            onClick={() => navigate('/quotes', { state: { clientToPreload: client } })}
            className="action-btn !px-3 !py-1.5 text-xs"
          >
            <Plus className="w-3.5 h-3.5" /> New Quote
          </button>
          <button
            onClick={() => navigate('/invoices', { state: { clientToPreload: client } })}
            className="action-btn !px-3 !py-1.5 text-xs"
          >
            <Plus className="w-3.5 h-3.5" /> New Invoice
          </button>
        </div>
      </div>

      {/* Quotes */}
      {showQuotes && (
        <div className={cn(subtleCard, 'p-4')}>
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-400" /> Quotes ({filteredQuotes.length})
          </h3>
          {filteredQuotes.length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {filteredQuotes.map(q => (
                <div
                  key={q.id}
                  className="flat-card flat-card--interactive p-3 flex items-center justify-between group"
                  onClick={() => navigate(`/quotes/${q.id}`)}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <span className="font-medium text-sm">Quote {formatDocNumber(q.quoteNumber)}</span>
                    <span className="text-xs text-surface-400">{fmtDate(q.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm mr-1">{formatCurrency(q.total)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ type: 'quote', id: q.id, label: `Quote ${formatDocNumber(q.quoteNumber)}` }); }}
                      className="icon-button" title="Delete Quote"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-surface-500 opacity-0 group-hover:opacity-50 transition-opacity" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-surface-400 text-sm">
              {hasActiveFilters ? 'No quotes match the current filters.' : 'No quotes yet.'}
            </p>
          )}
        </div>
      )}

      {/* Invoices */}
      {showInvoices && (
        <div className={cn(subtleCard, 'p-4')}>
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-emerald-400" /> Invoices ({filteredInvoices.length})
          </h3>
          {filteredInvoices.length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {filteredInvoices.map(i => (
                <div
                  key={i.id}
                  className="flat-card flat-card--interactive p-3 flex items-center justify-between group"
                  onClick={async () => {
                    const result = await api.get('/invoices/' + i.id);
                    navigate('/invoices', { state: { invoiceToLoad: result.data } });
                  }}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <span className="font-medium text-sm">Invoice {formatDocNumber(i.invoiceNumber)}</span>
                    <span className={cn('chip text-xs', statusColors[i.status])}>{i.status}</span>
                    {i.dueDate && (
                      <span className="text-xs text-surface-400 hidden sm:inline">Due: {fmtDate(i.dueDate)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right mr-1">
                      <span className="font-semibold text-sm">{formatCurrency(i.total)}</span>
                      {i.paidAmount > 0 && i.status !== 'paid' && (
                        <p className="text-xs text-surface-400">Paid: {formatCurrency(i.paidAmount)}</p>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirm({
                        type: 'invoice',
                        id: i.id,
                        label: `Invoice ${formatDocNumber(i.invoiceNumber)}${i.paidAmount > 0 ? ` (${formatCurrency(i.paidAmount)} in payments will be converted to credit)` : ''}`,
                      }); }}
                      className="icon-button" title="Delete Invoice"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-surface-500 opacity-0 group-hover:opacity-50 transition-opacity" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-surface-400 text-sm">
              {hasActiveFilters ? 'No invoices match the current filters.' : 'No invoices yet.'}
            </p>
          )}
        </div>
      )}

      {/* Payments */}
      {showPayments && (
        <div className={cn(subtleCard, 'p-4')}>
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-violet-400" /> Payments ({filteredPayments.length})
          </h3>
          {filteredPayments.length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {filteredPayments.map(p => (
                <div
                  key={p.id}
                  className="flat-card flat-card--interactive p-3 flex items-center justify-between group"
                  onClick={async () => {
                    const result = await api.get('/invoices/' + p.invoiceId);
                    navigate('/invoices', { state: { invoiceToLoad: result.data } });
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-4 flex-wrap">
                      <span className="font-medium text-sm">{formatCurrency(p.amount)}</span>
                      <span className="text-xs text-surface-400">{p.method}</span>
                      <span className="text-xs text-surface-400">
                        Invoice {formatDocNumber(p.invoiceNumber)}
                      </span>
                      {p.stripePaymentIntentId && (
                        <a
                          href={`https://dashboard.stripe.com/payments/${p.stripePaymentIntentId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[11px] font-mono text-accent hover:underline truncate max-w-[180px]"
                          title={p.stripePaymentIntentId}
                        >{p.stripePaymentIntentId}</a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-surface-400">
                      {fmtDate(p.paymentDate)}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setPaymentAction({ id: p.id, amount: p.amount, label: `${formatCurrency(p.amount)} payment on Invoice ${formatDocNumber(p.invoiceNumber)}`, stripePaymentIntentId: p.stripePaymentIntentId || null }); }}
                      className="icon-button" title="Delete Payment"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-surface-500 opacity-0 group-hover:opacity-50 transition-opacity" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-surface-400 text-sm">
              {hasActiveFilters ? 'No payments match the current filters.' : 'No payments yet.'}
            </p>
          )}
        </div>
      )}

      {/* Credits */}
      {showCredits && (
        <div className={cn(subtleCard, 'p-4')}>
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
            <Gift className="w-4 h-4 text-teal-400" /> Credits ({filteredCredits.length})
          </h3>
          {filteredCredits.length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {filteredCredits.map(c => (
                <div key={c.id} className="flat-card p-3 flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <span className="font-medium text-sm text-teal-400">{formatCurrency(c.amount)}</span>
                    {c.reason && <span className="text-xs text-surface-400 truncate">{c.reason}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-surface-400">
                      {fmtDate(c.createdAt)}
                    </span>
                    <button
                      onClick={() => setDeleteConfirm({ type: 'credit', id: c.id, label: `${formatCurrency(c.amount)} credit` })}
                      className="icon-button" title="Delete Credit"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-surface-400 text-sm">
              {hasActiveFilters ? 'No credits match the current filters.' : 'No credits yet.'}
            </p>
          )}
        </div>
      )}

      {/* Shared Delete Confirmation Dialog (quotes, invoices, credits) */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteConfirm?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.type === 'invoice'
                ? 'This will permanently delete this invoice, its line items, and all associated payments. If the invoice has payments, a credit will be automatically created for this client.'
                : deleteConfirm?.type === 'credit'
                  ? 'This will permanently remove this credit from the client. This action cannot be undone.'
                  : 'This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Payment Action Dialog */}
      <AlertDialog open={!!paymentAction} onOpenChange={(open) => { if (!open) setPaymentAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {paymentAction?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              What would you like to do with this payment?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <button
              onClick={() => handlePaymentAction('delete')}
              className="action-btn action-btn--secondary w-full justify-start !px-4 !py-3 text-sm"
            >
              <Trash2 className="w-4 h-4 text-destructive mr-3 shrink-0" />
              <div className="text-left">
                <div className="font-medium">Just Delete</div>
                <div className="text-xs text-muted-foreground">
                  Remove the payment record. No credit or refund.
                </div>
              </div>
            </button>
            <button
              onClick={() => handlePaymentAction('credit')}
              className="action-btn action-btn--secondary w-full justify-start !px-4 !py-3 text-sm"
            >
              <Gift className="w-4 h-4 mr-3 shrink-0" style={{ color: 'rgb(var(--color-success))' }} />
              <div className="text-left">
                <div className="font-medium">Convert to Credit</div>
                <div className="text-xs text-muted-foreground">
                  Remove the payment and add {paymentAction ? formatCurrency(paymentAction.amount) : ''} as client credit.
                </div>
              </div>
            </button>
            <button
              onClick={() => handlePaymentAction('refund')}
              className="action-btn action-btn--secondary w-full justify-start !px-4 !py-3 text-sm"
            >
              <Undo2 className="w-4 h-4 text-muted-foreground mr-3 shrink-0" />
              <div className="text-left">
                <div className="font-medium">Refund Customer</div>
                <div className="text-xs text-muted-foreground">
                  Remove the payment record. Money was already returned to the customer.
                  {paymentAction?.stripePaymentIntentId && <span className="block text-destructive mt-0.5">The Stripe charge will NOT be refunded.</span>}
                </div>
              </div>
            </button>
            {paymentAction?.stripePaymentIntentId && (
              <button
                onClick={() => handlePaymentAction('stripe_refund')}
                className="action-btn action-btn--secondary w-full justify-start !px-4 !py-3 text-sm"
              >
                <CreditCard className="w-4 h-4 text-primary mr-3 shrink-0" />
                <div className="text-left">
                  <div className="font-medium">Refund to Card</div>
                  <div className="text-xs text-muted-foreground">
                    Refund {paymentAction ? formatCurrency(paymentAction.amount) : ''} back to the customer's card via Stripe.
                  </div>
                </div>
              </button>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ── Profile Tab ─────────────────────────────────────────────────────────────

const ProfileTab = ({ client, clientId }) => {
  const updateClient = useUpdateClient();
  const [form, setForm] = useState({});

  // Hydrate form when client loads
  React.useEffect(() => {
    if (client) {
      setForm({
        displayName: client.displayName || '',
        firstName: client.firstName || '',
        lastName: client.lastName || '',
        email: client.email || '',
        phone: client.phone || '',
        phone2: client.phone2 || '',
        company: client.company || '',
        billingStreet: client.billingStreet || '',
        billingCity: client.billingCity || '',
        billingState: client.billingState || '',
        billingPostalCode: client.billingPostalCode || '',
        billingCountry: client.billingCountry || 'US',
        shippingStreet: client.shippingStreet || '',
        shippingCity: client.shippingCity || '',
        shippingState: client.shippingState || '',
        shippingPostalCode: client.shippingPostalCode || '',
        shippingCountry: client.shippingCountry || 'US',
      });
    }
  }, [client]);

  const handleChange = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handlePhoneChange = useCallback((field) => (e) => {
    const cleaned = e.target.value.replace(/\D/g, '');
    if (cleaned.length <= 10) {
      setForm(prev => ({ ...prev, [field]: cleaned }));
    }
  }, []);

  const copyBillingToShipping = () => {
    setForm(prev => ({
      ...prev,
      shippingStreet: prev.billingStreet,
      shippingCity: prev.billingCity,
      shippingState: prev.billingState,
      shippingPostalCode: prev.billingPostalCode,
      shippingCountry: prev.billingCountry,
    }));
  };

  const hasBillingAddr = client?.billingStreet || client?.billingCity || client?.billingState;
  const hasShippingAddr = client?.shippingStreet || client?.shippingCity || client?.shippingState;
  const [billingOpen, setBillingOpen] = useState(!!hasBillingAddr);
  const [shippingOpen, setShippingOpen] = useState(!!hasShippingAddr);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.firstName) {
      toast({ title: "First name is required", variant: "destructive" });
      return;
    }
    try {
      await updateClient.mutateAsync({ id: clientId, ...form });
    } catch { /* handled by mutation */ }
  };

  const field = (label, name, placeholder, type = 'text') => (
    <>
      <label className="block text-xs font-medium text-surface-400 mb-1.5 uppercase tracking-wider">{label}</label>
      <input
        type={type}
        value={form[name] || ''}
        onChange={(e) => handleChange(name, e.target.value)}
        className="glass-input w-full"
        placeholder={placeholder}
      />
    </>
  );

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Contact Information */}
      <div className={cn(subtleCard, 'p-5')}>
        <h3 className="text-sm font-semibold text-surface-500 uppercase tracking-wider mb-4">Contact Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">{field('Display / Business Name', 'displayName', 'e.g. "Sarah & Mike Thompson" or "ABC Corporation"')}</div>
          <div>{field('First Name *', 'firstName', 'First name')}</div>
          <div>{field('Last Name', 'lastName', 'Last name')}</div>
          <div>{field('Email', 'email', 'email@example.com', 'email')}</div>
          <div>
            <label className="block text-xs font-medium text-surface-400 mb-1.5 uppercase tracking-wider">Phone</label>
            <input
              type="tel" inputMode="tel"
              value={formatPhoneNumber(form.phone)}
              onChange={handlePhoneChange('phone')}
              className="glass-input w-full"
              placeholder="(555) 555-5555"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-400 mb-1.5 uppercase tracking-wider">Phone 2</label>
            <input
              type="tel" inputMode="tel"
              value={formatPhoneNumber(form.phone2)}
              onChange={handlePhoneChange('phone2')}
              className="glass-input w-full"
              placeholder="(555) 555-5555"
            />
          </div>
          <div className="md:col-span-2">{field('Company', 'company', 'Company name')}</div>
        </div>
      </div>

      {/* Billing Address (collapsible) */}
      <div className={cn(subtleCard, 'overflow-hidden')}>
        <button type="button" onClick={() => setBillingOpen(!billingOpen)} className="w-full flex items-center justify-between p-5 hover:bg-surface-50 transition-colors">
          <h3 className="text-sm font-semibold text-surface-500 uppercase tracking-wider">Billing Address</h3>
          <ChevronDown className={cn("w-4 h-4 text-surface-400 transition-transform", billingOpen && "rotate-180")} />
        </button>
        <AnimatePresence initial={false}>
          {billingOpen && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
              <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">{field('Street', 'billingStreet', 'Street address')}</div>
                <div>{field('City', 'billingCity', 'City')}</div>
                <div>
                  <label className="block text-xs font-medium text-surface-400 mb-1.5 uppercase tracking-wider">State / Province</label>
                  <select value={form.billingState || ''} onChange={(e) => handleChange('billingState', e.target.value)} className="glass-select w-full">
                    <option value="">Select state</option>
                    {Object.entries(US_STATE_NAMES).map(([code, name]) => (
                      <option key={code} value={code}>{name} ({code})</option>
                    ))}
                  </select>
                </div>
                <div>{field('Postal Code', 'billingPostalCode', 'Postal code')}</div>
                <div>
                  <label className="block text-xs font-medium text-surface-400 mb-1.5 uppercase tracking-wider">Country</label>
                  <select value={form.billingCountry || 'US'} onChange={(e) => handleChange('billingCountry', e.target.value)} className="glass-select w-full">
                    <option value="US">United States</option>
                    <option value="CA">Canada</option>
                    <option value="MX">Mexico</option>
                  </select>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Shipping Address (collapsible) */}
      <div className={cn(subtleCard, 'overflow-hidden')}>
        <button type="button" onClick={() => setShippingOpen(!shippingOpen)} className="w-full flex items-center justify-between p-5 hover:bg-surface-50 transition-colors">
          <h3 className="text-sm font-semibold text-surface-500 uppercase tracking-wider">Shipping Address</h3>
          <ChevronDown className={cn("w-4 h-4 text-surface-400 transition-transform", shippingOpen && "rotate-180")} />
        </button>
        <AnimatePresence initial={false}>
          {shippingOpen && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
              <div className="px-5 pb-2 flex justify-end">
                <button type="button" onClick={copyBillingToShipping} className="action-btn action-btn--secondary !px-2.5 !py-1 text-xs flex items-center gap-1.5">
                  <Copy className="w-3 h-3" /> Copy from billing
                </button>
              </div>
              <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">{field('Street', 'shippingStreet', 'Street address')}</div>
                <div>{field('City', 'shippingCity', 'City')}</div>
                <div>
                  <label className="block text-xs font-medium text-surface-400 mb-1.5 uppercase tracking-wider">State / Province</label>
                  <select value={form.shippingState || ''} onChange={(e) => handleChange('shippingState', e.target.value)} className="glass-select w-full">
                    <option value="">Select state</option>
                    {Object.entries(US_STATE_NAMES).map(([code, name]) => (
                      <option key={code} value={code}>{name} ({code})</option>
                    ))}
                  </select>
                </div>
                <div>{field('Postal Code', 'shippingPostalCode', 'Postal code')}</div>
                <div>
                  <label className="block text-xs font-medium text-surface-400 mb-1.5 uppercase tracking-wider">Country</label>
                  <select value={form.shippingCountry || 'US'} onChange={(e) => handleChange('shippingCountry', e.target.value)} className="glass-select w-full">
                    <option value="US">United States</option>
                    <option value="CA">Canada</option>
                    <option value="MX">Mexico</option>
                  </select>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex justify-end">
        <button type="submit" className="action-btn" disabled={updateClient.isPending}>
          {updateClient.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
        </button>
      </div>
    </form>
  );
};

// ── Notes Tab ───────────────────────────────────────────────────────────────

const NotesTab = ({ clientId }) => {
  const [noteContent, setNoteContent] = useState('');
  const createNote = useCreateClientNote();
  const deleteNote = useDeleteClientNote();

  const { data: notesRes, isLoading } = useQuery({
    queryKey: queryKeys.clients.notes(clientId),
    queryFn: () => api.get(`/clients/${clientId}/notes`),
    enabled: !!clientId,
  });

  const notes = notesRes?.data || [];

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!noteContent.trim()) return;
    try {
      await createNote.mutateAsync({ clientId, content: noteContent.trim() });
      setNoteContent('');
    } catch { /* handled by mutation */ }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleAddNote} className={cn(subtleCard, 'p-4')}>
        <textarea
          value={noteContent}
          onChange={(e) => setNoteContent(e.target.value)}
          className="glass-textarea w-full mb-3"
          rows={3}
          placeholder="Add an internal note..."
        />
        <div className="flex justify-end">
          <button
            type="submit"
            className="action-btn !px-3 !py-2 text-xs"
            disabled={!noteContent.trim() || createNote.isPending}
          >
            {createNote.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Send className="w-3.5 h-3.5" /> Add Note</>}
          </button>
        </div>
      </form>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : notes.length > 0 ? (
        <div className="space-y-3">
          {notes.map(note => (
            <motion.div
              key={note.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(subtleCard, 'p-4')}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                  <div className="flex items-center gap-2 mt-2 text-xs text-surface-400">
                    <span>{note.createdBy}</span>
                    <span>&middot;</span>
                    <span>{fmtDate(note.createdAt)} {fmtTime(note.createdAt)}</span>
                  </div>
                </div>
                <button
                  onClick={() => deleteNote.mutate({ clientId, noteId: note.id })}
                  className="icon-button shrink-0"
                  title="Delete note"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className={cn(subtleCard, 'p-8 text-center')}>
          <StickyNote className="w-8 h-8 text-surface-500 mx-auto mb-2" />
          <p className="text-surface-400 text-sm">No notes yet. Add one above.</p>
        </div>
      )}
    </div>
  );
};

// ── Projects Tab ─────────────────────────────────────────────────────────────

const ProjectsTab = ({ clientId }) => {
  const navigate = useNavigate();
  const { data: projectsRes, isLoading } = useQuery({
    queryKey: [...queryKeys.projects.all, 'byClient', clientId],
    queryFn: () => api.get('/projects', { clientId, pageSize: '200', status: '' }),
    enabled: !!clientId,
  });

  const projects = projectsRes?.data || [];

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  if (projects.length === 0) {
    return (
      <div className={cn(subtleCard, 'p-12 text-center')}>
        <FolderKanban className="w-8 h-8 text-surface-400 mx-auto mb-2" />
        <p className="text-surface-400 text-sm">No projects yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {projects.map((p, i) => (
        <motion.div
          key={p.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.03 }}
          className="flat-card flat-card--interactive p-3 flex items-center justify-between group"
          onClick={() => navigate(`/projects/${p.id}`)}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <FolderKanban className="w-4 h-4 text-surface-400 shrink-0" />
            <div className="min-w-0">
              <span className="font-medium text-sm truncate block">{p.title}</span>
              <div className="flex items-center gap-2 text-xs text-surface-400 mt-0.5">
                {p.projectType && <span className="capitalize">{p.projectType.replace('_', ' ')}</span>}
                {p.shootStartDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {p.shootEndDate
                      ? (() => {
                          const s = tzDate(p.shootStartDate);
                          const e = tzDate(p.shootEndDate);
                          const sameMonth = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth();
                          return sameMonth
                            ? `${fmtDate(p.shootStartDate, { month: 'short' })} ${s.getDate()}–${e.getDate()}, ${e.getFullYear()}`
                            : `${fmtDate(p.shootStartDate, { month: 'short', day: 'numeric', year: 'numeric' })} – ${fmtDate(p.shootEndDate, { month: 'short', day: 'numeric', year: 'numeric' })}`;
                        })()
                      : fmtDate(p.shootStartDate, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('text-xs font-medium capitalize', PROJECT_STATUS_COLORS[p.status] || 'text-surface-500')}>{p.status}</span>
            <ChevronRight className="w-4 h-4 text-surface-500 opacity-0 group-hover:opacity-50 transition-opacity" />
          </div>
        </motion.div>
      ))}
    </div>
  );
};

// ── Main Component ──────────────────────────────────────────────────────────

const ClientProfile = () => {
  const { id: clientId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('transactions');
  const { tabsRef, scrollToTabs } = useTabScroll();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const deleteClient = useDeleteClient();

  // Fetch client detail
  const { data: clientRes, isLoading: clientLoading } = useQuery({
    queryKey: queryKeys.clients.detail(clientId),
    queryFn: () => api.get('/clients/' + clientId),
    enabled: !!clientId,
  });
  const client = clientRes?.data;

  // Fetch client's quotes
  const { data: quotesRes } = useQuery({
    queryKey: queryKeys.quotes.byClient(clientId),
    queryFn: () => api.get('/quotes', { clientId, orderBy: 'createdAt', asc: 'false', pageSize: '200' }),
    enabled: !!clientId,
  });
  const quotes = quotesRes?.data || [];

  // Fetch client's invoices (includes payments)
  const { data: invoicesRes } = useQuery({
    queryKey: queryKeys.invoices.byClient(clientId),
    queryFn: () => api.get('/invoices', { clientId, orderBy: 'createdAt', asc: 'false', pageSize: '200' }),
    enabled: !!clientId,
  });
  const invoices = invoicesRes?.data || [];

  // Fetch client's credits
  const { data: creditsRes } = useQuery({
    queryKey: queryKeys.credits.byClient(clientId),
    queryFn: () => api.get('/credits', { clientId }),
    enabled: !!clientId,
  });
  const credits = creditsRes?.data || [];

  // Financial summary
  const financial = useMemo(() => {
    const totalInvoiced = invoices.reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0);
    const totalPaid = invoices.reduce((sum, inv) => sum + (parseFloat(inv.paidAmount) || 0), 0);
    const openBalance = totalInvoiced - totalPaid;
    const totalCredits = credits.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
    const now = new Date();
    const overdueAmount = invoices
      .filter(inv => inv.status !== 'paid' && inv.dueDate && new Date(inv.dueDate) < now)
      .reduce((sum, inv) => sum + ((parseFloat(inv.total) || 0) - (parseFloat(inv.paidAmount) || 0)), 0);
    return { totalInvoiced, totalPaid, openBalance, overdueAmount, totalCredits };
  }, [invoices, credits]);

  const handleDeleteClient = async () => {
    try {
      await deleteClient.mutateAsync(clientId);
      navigate('/clients');
    } catch { /* handled */ }
    setIsDeleteDialogOpen(false);
  };

  if (clientLoading || !client) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  const clientFullName = client.displayName || `${client.firstName || ''} ${client.lastName || ''}`.trim();
  const billingAddr = formatAddress('billing', client);
  const shippingAddr = formatAddress('shipping', client);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      {/* Delete Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {clientFullName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this client and all associated quotes, invoices, and payments. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteClient}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Back button */}
      <button onClick={() => navigate('/clients')} className="action-btn action-btn--secondary !px-3 !py-1.5 text-sm">
        <ChevronLeft className="w-4 h-4" /> Back to Clients
      </button>

      {/* Header Card */}
      <div className={cn(subtleCard, 'p-5')}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">{clientFullName}</h2>
            {client.company && (
              <p className="text-surface-500 flex items-center gap-1.5 mt-0.5">
                <Building2 className="w-4 h-4" /> {client.company}
              </p>
            )}
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-sm text-surface-400">
              {client.email && (
                <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-blue-400" /> {client.email}</span>
              )}
              {client.phone && (
                <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-blue-400" /> {formatPhoneNumber(client.phone)}</span>
              )}
              {client.phone2 && (
                <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-blue-400" /> {formatPhoneNumber(client.phone2)}</span>
              )}
              {billingAddr && (
                <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-blue-400" /> {billingAddr}</span>
              )}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => setActiveTab('profile')} className="action-btn action-btn--secondary !px-3 !py-1.5 text-xs">
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </button>
            <button onClick={() => setIsDeleteDialogOpen(true)} className="action-btn action-btn--secondary !px-3 !py-1.5 text-xs text-red-400 hover:!bg-red-600 hover:!text-[#C8C6C2] hover:!border-red-600">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </div>
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <FinancialCard label="Total Invoiced" value={formatCurrency(financial.totalInvoiced)} delay={0} />
        <FinancialCard label="Total Paid" value={formatCurrency(financial.totalPaid)} accent="text-emerald-600" delay={0.05} />
        <FinancialCard label="Open Balance" value={formatCurrency(financial.openBalance)} accent="text-amber-600" delay={0.1} />
        <FinancialCard label="Overdue" value={formatCurrency(financial.overdueAmount)} accent={financial.overdueAmount > 0 ? "text-red-600" : undefined} delay={0.15} />
        {financial.totalCredits > 0 && (
          <FinancialCard label="Credits" value={formatCurrency(financial.totalCredits)} accent="text-teal-600" delay={0.2} />
        )}
      </div>

      {/* Tab Navigation */}
      <div ref={tabsRef} className="scroll-mt-14 lg:scroll-mt-0">
        <div className="nav-tabs flex gap-1 w-full md:w-fit overflow-x-auto overflow-y-hidden scrollbar-hide !border-b-0" style={{ WebkitOverflowScrolling: 'touch' }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={(e) => { setActiveTab(tab.key); scrollToTabs(); e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); }}
              className={cn(
                "nav-tab relative flex items-center gap-1.5 px-3 pb-2.5 text-sm whitespace-nowrap transition-colors duration-200 flex-shrink-0",
                activeTab === tab.key ? "nav-tab--active" : ""
              )}
            >
              <tab.icon className="w-3.5 h-3.5 hidden md:block" />
              {tab.label}
              {activeTab === tab.key && (
                <motion.div
                  layoutId="client-tab-glass"
                  className="nav-tab__glass"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
            </button>
          ))}
        </div>
        <div className="border-b border-surface-200" />
        {/* Dot indicators — mobile only */}
        <div className="flex justify-center gap-1.5 pt-2 sm:hidden">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); scrollToTabs(); }}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-colors duration-200",
                activeTab === tab.key ? "bg-surface-500" : "bg-surface-200"
              )}
            />
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.1 }}
      >
          {activeTab === 'transactions' && (
            <TransactionsTab quotes={quotes} invoices={invoices} credits={credits} navigate={navigate} client={client} clientId={clientId} />
          )}
          {activeTab === 'projects' && (
            <ProjectsTab clientId={clientId} />
          )}
          {activeTab === 'profile' && (
            <ProfileTab client={client} clientId={clientId} />
          )}
          {activeTab === 'notes' && (
            <NotesTab clientId={clientId} />
          )}
        </motion.div>
    </motion.div>
  );
};

export default ClientProfile;
