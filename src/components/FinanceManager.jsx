import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Banknote, Plus, Loader2, Edit2, Trash2, ArrowDownLeft, ArrowUpRight,
  DollarSign, TrendingDown, CircleDot, CreditCard,
} from 'lucide-react';
import { cn, fmtDate, tzDate, toDateInput } from '@/lib/utils';
import { queryKeys } from '@/lib/queryKeys';
import {
  useCreateTeamAdvance, useUpdateTeamAdvance, useDeleteTeamAdvance,
  useCreateTeamPayment, useUpdateTeamPayment, useDeleteTeamPayment,
} from '@/hooks/useMutations';
import { useAppData } from '@/hooks/useAppData';
import api from '@/lib/apiClient';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/* ─── Helpers ──────────────────────────────────────────────────────────── */

function formatCurrency(n) {
  return '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateShort(d) {
  if (!d) return { month: '', day: '' };
  const dt = tzDate(d);
  return {
    month: fmtDate(d, { month: 'short' }).toUpperCase(),
    day: dt.getDate(),
  };
}

const getMemberName = (m) => {
  if (!m) return '';
  return m.displayName || [m.firstName, m.lastName].filter(Boolean).join(' ') || m.name || m.userName || m.userEmail || 'Unknown';
};

/* ─── Tinted Hero Card (matches Dashboard BigNumber cards) ──────────── */

const tints = {
  green:   'bg-[rgba(68,131,97,0.06)]',
  red:     'bg-[rgba(212,76,71,0.06)]',
  orange:  'bg-[rgba(217,115,13,0.06)]',
  blue:    'bg-[rgba(35,131,226,0.06)]',
  neutral: 'bg-[rgba(55,53,47,0.03)]',
};

const valueColors = {
  green:   'text-[rgb(68,131,97)]',
  red:     'text-[rgb(212,76,71)]',
  orange:  'text-[rgb(217,115,13)]',
  blue:    'text-[rgb(35,131,226)]',
  default: 'text-surface-700',
};

const HeroCard = ({ label, value, tint = 'neutral', color = 'default', hero }) => (
  <div className="content-card">
    <div className={cn(
      'min-w-0 h-full px-4 py-3.5 sm:px-5 sm:py-4 transition-colors',
      tints[tint] || ''
    )}>
      <p className={cn(
        'tabular-nums leading-none tracking-tight truncate',
        hero ? 'text-[clamp(1.25rem,4vw,2.25rem)] font-bold' : 'text-[clamp(1rem,3.5vw,1.5rem)] font-bold',
        valueColors[color] || valueColors.default
      )}>
        {value}
      </p>
      <p className="text-[10px] sm:text-xs font-medium uppercase tracking-[0.08em] text-surface-400 mt-2 sm:mt-2.5 truncate">
        {label}
      </p>
    </div>
  </div>
);

/* ─── Advance Form Dialog ──────────────────────────────────────────── */

const AdvanceFormDialog = ({ open, onClose, editEntry, teamMemberId, type: defaultType, teamMembers: advMembers }) => {
  const createAdvance = useCreateTeamAdvance();
  const updateAdvance = useUpdateTeamAdvance();
  const isEditing = !!editEntry;

  const [form, setForm] = useState(() => editEntry ? {
    teamMemberId: editEntry.teamMemberId,
    type: editEntry.type,
    amount: String(editEntry.amount),
    description: editEntry.description,
    advanceDate: editEntry.advanceDate ? toDateInput(editEntry.advanceDate) : toDateInput(new Date()),
  } : {
    teamMemberId: teamMemberId || '',
    type: defaultType || 'advance',
    amount: '',
    description: '',
    advanceDate: toDateInput(new Date()),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const memberId = form.teamMemberId || teamMemberId;
    if (!memberId || !form.amount || !form.description) return;
    const payload = {
      teamMemberId: memberId,
      type: form.type,
      amount: parseFloat(form.amount),
      description: form.description,
      advanceDate: form.advanceDate,
    };
    if (isEditing) {
      updateAdvance.mutate({ id: editEntry.id, ...payload }, { onSuccess: onClose });
    } else {
      createAdvance.mutate(payload, { onSuccess: onClose });
    }
  };

  const isPending = createAdvance.isPending || updateAdvance.isPending;
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-[rgb(var(--glass-bg))] rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100">
          <h3 className="text-base font-semibold text-surface-800">
            {isEditing ? 'Edit Entry' : form.type === 'advance' ? 'Record Advance' : 'Record Repayment'}
          </h3>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-600 text-lg">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {advMembers && advMembers.length > 0 && (
            <div>
              <label className="text-xs font-medium text-surface-500 mb-1 block">Team Member</label>
              <select value={form.teamMemberId}
                onChange={e => setForm(f => ({ ...f, teamMemberId: e.target.value }))}
                className="glass-input w-full" required>
                <option value="">Select member...</option>
                {advMembers.map(m => (
                  <option key={m.id} value={m.id}>{getMemberName(m)}</option>
                ))}
              </select>
            </div>
          )}
          {!isEditing && (
            <div>
              <label className="text-xs font-medium text-surface-500 mb-1 block">Type</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setForm(f => ({ ...f, type: 'advance' }))}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                    form.type === 'advance'
                      ? 'border-[rgb(217,115,13)] bg-[rgba(217,115,13,0.08)] text-[rgb(217,115,13)]'
                      : 'border-surface-200 bg-[rgb(var(--glass-bg))] text-surface-500 hover:bg-surface-50'
                  }`}>Advance (lent)</button>
                <button type="button" onClick={() => setForm(f => ({ ...f, type: 'repayment' }))}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                    form.type === 'repayment'
                      ? 'border-[rgb(68,131,97)] bg-[rgba(68,131,97,0.08)] text-[rgb(68,131,97)]'
                      : 'border-surface-200 bg-[rgb(var(--glass-bg))] text-surface-500 hover:bg-surface-50'
                  }`}>Repayment</button>
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-surface-500 mb-1 block">Amount ($)</label>
            <input type="number" inputMode="decimal" step="0.01" min="0.01"
              value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className="glass-input w-full" placeholder="0.00" required />
          </div>
          <div>
            <label className="text-xs font-medium text-surface-500 mb-1 block">Description</label>
            <input type="text" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="glass-input w-full"
              placeholder={form.type === 'advance' ? 'e.g. sweater, gas money' : 'e.g. deducted from gig payment'}
              required />
          </div>
          <div>
            <label className="text-xs font-medium text-surface-500 mb-1 block">Date</label>
            <input type="date" value={form.advanceDate}
              onChange={e => setForm(f => ({ ...f, advanceDate: e.target.value }))}
              className="glass-input w-full" />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="action-btn action-btn--secondary flex-1">Cancel</button>
            <button type="submit" disabled={isPending} className="action-btn flex-1">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : isEditing ? 'Save' : 'Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ─── Team Payment Form Dialog ─────────────────────────────────────── */

const PaymentFormDialog = ({ open, onClose, editEntry, teamMembers: allMembers, selectedMemberId }) => {
  const createPayment = useCreateTeamPayment();
  const updatePayment = useUpdateTeamPayment();
  const isEditing = !!editEntry;

  const [form, setForm] = useState(() => isEditing ? {
    teamMemberId: editEntry.teamMemberId,
    amount: String(editEntry.amount),
    paymentDate: editEntry.paymentDate ? toDateInput(editEntry.paymentDate) : toDateInput(new Date()),
    paymentMethod: editEntry.paymentMethod || '',
    status: editEntry.status || 'paid',
    notes: editEntry.notes || '',
  } : {
    teamMemberId: selectedMemberId || '',
    amount: '',
    paymentDate: toDateInput(new Date()),
    paymentMethod: '',
    status: 'paid',
    notes: '',
  });

  useEffect(() => {
    if (!isEditing && selectedMemberId) setForm(f => ({ ...f, teamMemberId: selectedMemberId }));
  }, [selectedMemberId, isEditing]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.teamMemberId || !form.amount) return;
    const payload = {
      teamMemberId: form.teamMemberId,
      amount: parseFloat(form.amount),
      paymentDate: form.paymentDate || undefined,
      paymentMethod: form.paymentMethod || undefined,
      status: form.status,
      notes: form.notes || undefined,
    };
    if (isEditing) {
      updatePayment.mutate({ id: editEntry.id, ...payload }, { onSuccess: onClose });
    } else {
      createPayment.mutate(payload, { onSuccess: onClose });
    }
  };

  const isPending = createPayment.isPending || updatePayment.isPending;
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-[rgb(var(--glass-bg))] rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100">
          <h3 className="text-base font-semibold text-surface-800">
            {isEditing ? 'Edit Payment' : 'Record Payment'}
          </h3>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-600 text-lg">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="text-xs font-medium text-surface-500 mb-1 block">Team Member</label>
            <select value={form.teamMemberId}
              onChange={e => setForm(f => ({ ...f, teamMemberId: e.target.value }))}
              className="glass-input w-full" required>
              <option value="">Select member...</option>
              {(allMembers || []).map(m => (
                <option key={m.id} value={m.id}>{getMemberName(m)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-surface-500 mb-1 block">Amount ($)</label>
            <input type="number" inputMode="decimal" step="0.01" min="0.01"
              value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className="glass-input w-full" placeholder="0.00" required />
          </div>
          <div>
            <label className="text-xs font-medium text-surface-500 mb-1 block">Date</label>
            <input type="date" value={form.paymentDate}
              onChange={e => setForm(f => ({ ...f, paymentDate: e.target.value }))}
              className="glass-input w-full" />
          </div>
          <div>
            <label className="text-xs font-medium text-surface-500 mb-1 block">Payment Method</label>
            <select value={form.paymentMethod}
              onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}
              className="glass-input w-full">
              <option value="">Not specified</option>
              <option value="Cash">Cash</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Zelle">Zelle</option>
              <option value="Venmo">Venmo</option>
              <option value="Check">Check</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-surface-500 mb-1 block">Status</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setForm(f => ({ ...f, status: 'paid' }))}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                  form.status === 'paid'
                    ? 'border-[rgb(68,131,97)] bg-[rgba(68,131,97,0.08)] text-[rgb(68,131,97)]'
                    : 'border-surface-200 bg-[rgb(var(--glass-bg))] text-surface-500 hover:bg-surface-50'
                }`}>Paid</button>
              <button type="button" onClick={() => setForm(f => ({ ...f, status: 'pending' }))}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                  form.status === 'pending'
                    ? 'border-[rgb(217,115,13)] bg-[rgba(217,115,13,0.08)] text-[rgb(217,115,13)]'
                    : 'border-surface-200 bg-[rgb(var(--glass-bg))] text-surface-500 hover:bg-surface-50'
                }`}>Pending</button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-surface-500 mb-1 block">Notes</label>
            <textarea value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="glass-input w-full" rows={2}
              placeholder="e.g. Equipment rental, travel reimbursement" />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="action-btn action-btn--secondary flex-1">Cancel</button>
            <button type="submit" disabled={isPending} className="action-btn flex-1">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : isEditing ? 'Save' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ─── Advance Entry Row ────────────────────────────────────────────── */

const AdvanceEntryRow = ({ entry, canManage, onEdit, onDelete, index, showMember }) => {
  const { month, day } = formatDateShort(entry.advanceDate);
  const isAdvance = entry.type === 'advance';
  const memberName = entry.memberDisplayName || [entry.memberFirstName, entry.memberLastName].filter(Boolean).join(' ') || entry.memberName || entry.memberEmail || '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.3) }}
      className="flex items-center gap-3 py-3 px-3 -mx-1 rounded-xl hover:bg-surface-50/80 transition-colors group"
    >
      {/* Date block */}
      <div className={cn(
        'w-11 h-11 rounded-lg flex flex-col items-center justify-center shrink-0 border',
        isAdvance
          ? 'bg-[rgba(217,115,13,0.05)] border-[rgba(217,115,13,0.12)]'
          : 'bg-[rgba(68,131,97,0.05)] border-[rgba(68,131,97,0.12)]'
      )}>
        <span className="text-[9px] font-semibold text-surface-400 leading-none">{month}</span>
        <span className="text-[15px] font-bold text-surface-700 leading-tight">{day}</span>
      </div>

      {/* Description */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-surface-800 leading-tight truncate">
          {showMember && memberName ? memberName : entry.description}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className={cn(
            'inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full',
            isAdvance
              ? 'text-[rgb(217,115,13)] bg-[rgba(217,115,13,0.08)]'
              : 'text-[rgb(68,131,97)] bg-[rgba(68,131,97,0.08)]'
          )}>
            {isAdvance ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
            {isAdvance ? 'Advance' : 'Repayment'}
          </span>
          {showMember && entry.description && (
            <span className="text-[11px] text-surface-400 truncate">{entry.description}</span>
          )}
          {entry.projectTitle && (
            <span className="text-[11px] text-surface-400 truncate">{entry.projectTitle}</span>
          )}
        </div>
      </div>

      {/* Amount */}
      <div className="text-right shrink-0">
        <p className={cn(
          'text-sm font-bold tabular-nums',
          isAdvance ? 'text-[rgb(217,115,13)]' : 'text-[rgb(68,131,97)]'
        )}>
          {isAdvance ? '-' : '+'}{formatCurrency(entry.amount)}
        </p>
      </div>

      {/* Actions */}
      {canManage && (
        <div className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={() => onEdit(entry)} className="p-1.5 rounded-md text-surface-400 hover:text-surface-600 hover:bg-surface-100">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(entry)} className="p-1.5 rounded-md text-surface-400 hover:text-red-500 hover:bg-red-50">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </motion.div>
  );
};

/* ─── Payment Entry Row ────────────────────────────────────────────── */

const PaymentEntryRow = ({ entry, canManage, onEdit, onDelete, index, showMember }) => {
  const { month, day } = formatDateShort(entry.paymentDate);
  const isPaid = entry.status === 'paid';
  const memberName = entry.memberDisplayName || [entry.memberFirstName, entry.memberLastName].filter(Boolean).join(' ') || entry.memberName || entry.memberEmail || '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.3) }}
      className="flex items-center gap-3 py-3 px-3 -mx-1 rounded-xl hover:bg-surface-50/80 transition-colors group"
    >
      {/* Date block */}
      <div className="w-11 h-11 rounded-lg bg-[rgba(35,131,226,0.05)] border border-[rgba(35,131,226,0.12)] flex flex-col items-center justify-center shrink-0">
        <span className="text-[9px] font-semibold text-surface-400 leading-none">{month}</span>
        <span className="text-[15px] font-bold text-surface-700 leading-tight">{day}</span>
      </div>

      {/* Description */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-surface-800 leading-tight truncate">
          {showMember && memberName ? memberName : (entry.notes || 'Team payment')}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className={cn(
            'inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full',
            isPaid
              ? 'text-[rgb(68,131,97)] bg-[rgba(68,131,97,0.08)]'
              : 'text-[rgb(217,115,13)] bg-[rgba(217,115,13,0.08)]'
          )}>
            <CircleDot className="w-3 h-3" />
            {isPaid ? 'Paid' : 'Pending'}
          </span>
          {entry.paymentMethod && (
            <span className="text-[11px] text-surface-400 flex items-center gap-1">
              <CreditCard className="w-3 h-3" />
              {entry.paymentMethod}
            </span>
          )}
          {showMember && entry.notes && (
            <span className="text-[11px] text-surface-400 truncate">{entry.notes}</span>
          )}
        </div>
      </div>

      {/* Amount */}
      <div className="text-right shrink-0">
        <p className="text-sm font-bold tabular-nums text-[rgb(35,131,226)]">
          {formatCurrency(entry.amount)}
        </p>
      </div>

      {/* Actions */}
      {canManage && (
        <div className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={() => onEdit(entry)} className="p-1.5 rounded-md text-surface-400 hover:text-surface-600 hover:bg-surface-100">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(entry)} className="p-1.5 rounded-md text-surface-400 hover:text-red-500 hover:bg-red-50">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </motion.div>
  );
};

/* ─── Empty State ──────────────────────────────────────────────────── */

const EmptyState = ({ icon: Icon, message }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.96 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ duration: 0.3 }}
    className="py-16 text-center"
  >
    <div className="w-12 h-12 rounded-xl bg-surface-50 border border-surface-200/60 flex items-center justify-center mx-auto mb-3">
      <Icon className="w-5 h-5 text-surface-300" />
    </div>
    <p className="text-sm text-surface-400">{message}</p>
  </motion.div>
);

/* ─── Main Component ──────────────────────────────────────────────── */

const FinanceManager = () => {
  const { isPrivileged, teamMemberId, can } = useAppData();
  const canManageAdvances = can('manage_advances');
  const canManagePayments = can('manage_team_payments');

  const [activeTab, setActiveTab] = useState('advances');

  // Advances state
  const [advMemberId, setAdvMemberId] = useState('all');
  const [advDialogOpen, setAdvDialogOpen] = useState(false);
  const [advDialogType, setAdvDialogType] = useState('advance');
  const [advEditEntry, setAdvEditEntry] = useState(null);
  const [advDeleteTarget, setAdvDeleteTarget] = useState(null);
  const deleteAdvance = useDeleteTeamAdvance();

  // Payments state
  const [payMemberId, setPayMemberId] = useState('all');
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payEditEntry, setPayEditEntry] = useState(null);
  const [payDeleteTarget, setPayDeleteTarget] = useState(null);
  const deletePayment = useDeleteTeamPayment();

  const activeAdvMemberId = isPrivileged ? advMemberId : teamMemberId;
  const advFilterAll = activeAdvMemberId === 'all';
  const activePayMemberId = isPrivileged ? payMemberId : teamMemberId;
  const payFilterAll = activePayMemberId === 'all';

  // Fetch team members
  const { data: teamData } = useQuery({
    queryKey: [...queryKeys.team.all, 'finance-members'],
    queryFn: () => api.get('/team').then(r => r.data || []),
    enabled: isPrivileged,
  });

  const allMembers = teamData || [];
  const membersWithAdvances = allMembers.filter(m => m.advancesEnabled);

  // No auto-select for either tab — both default to "View All"

  // ── Advances data ──
  const { data: balance } = useQuery({
    queryKey: queryKeys.teamAdvances.balance(activeAdvMemberId),
    queryFn: () => api.get(`/team-advances/balance/${activeAdvMemberId}`),
    enabled: !!activeAdvMemberId && !advFilterAll,
  });

  const advQueryParams = advFilterAll ? {} : { teamMemberId: activeAdvMemberId };
  const { data: advEntries = [], isLoading: advLoading } = useQuery({
    queryKey: queryKeys.teamAdvances.list({ teamMemberId: activeAdvMemberId }),
    queryFn: () => api.get('/team-advances', advQueryParams).then(r => r.data || []),
    enabled: advFilterAll || !!activeAdvMemberId,
  });

  // ── Payments data (manual only — no project linked) ──
  const payQueryParams = payFilterAll ? {} : { teamMemberId: activePayMemberId };
  const { data: rawPayEntries = [], isLoading: payLoading } = useQuery({
    queryKey: [...queryKeys.teamPayments.all, 'manual', activePayMemberId],
    queryFn: () => api.get('/team-payments', payQueryParams).then(r => r.data || []),
    enabled: isPrivileged || !!teamMemberId,
  });

  // Only show manual payments (not project-based team payments)
  const payEntries = rawPayEntries.filter(p => !p.projectId);

  const totalPaid = payEntries
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

  const pendingCount = payEntries.filter(p => p.status === 'pending').length;

  // Stat scroll tracking (advances, mobile)
  const statScrollRef = useRef(null);
  const [activeStatIdx, setActiveStatIdx] = useState(0);
  const STAT_COUNT = 3;

  const checkActiveCard = useCallback(() => {
    const el = statScrollRef.current;
    if (!el || !el.children.length) return;
    const card = el.children[0];
    const cardWidth = card.offsetWidth + 12;
    const idx = Math.round(el.scrollLeft / cardWidth);
    setActiveStatIdx(Math.min(idx, STAT_COUNT - 1));
  }, []);

  useEffect(() => {
    const el = statScrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkActiveCard, { passive: true });
    return () => el.removeEventListener('scroll', checkActiveCard);
  }, [checkActiveCard, !!balance]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isPrivileged && !teamMemberId) {
    return (
      <div className="text-center py-20">
        <p className="text-surface-500">Finance data is not available.</p>
      </div>
    );
  }

  // Compute balance — from endpoint when specific member, from entries when "View All"
  const computedBalance = advFilterAll ? (() => {
    const totalAdvanced = advEntries.filter(e => e.type === 'advance').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    const totalRepaid = advEntries.filter(e => e.type === 'repayment').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    return { totalAdvanced, totalRepaid, balance: totalAdvanced - totalRepaid };
  })() : balance;
  const balanceVal = computedBalance?.balance || 0;
  const balanceTint = balanceVal > 0 ? 'orange' : 'green';
  const balanceColor = balanceVal > 0 ? 'orange' : 'green';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-surface-100 flex items-center justify-center shrink-0">
          <Banknote className="w-5 h-5 text-surface-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-surface-800">Finance</h1>
          <p className="text-sm text-surface-500">Manage team advances and payments</p>
        </div>
      </div>

      {/* ── Tab Switcher with animated glass indicator ── */}
      <div className="nav-tabs flex gap-1 w-fit relative">
        <button
          onClick={() => setActiveTab('advances')}
          className={cn(
            'nav-tab relative flex items-center gap-2 px-3 pb-2.5 text-sm whitespace-nowrap transition-colors duration-200',
            activeTab === 'advances' ? 'nav-tab--active' : ''
          )}
        >
          Advances
          {activeTab === 'advances' && (
            <motion.div layoutId="finance-tab-glass" className="nav-tab__glass"
              transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
          )}
        </button>
        <button
          onClick={() => setActiveTab('payments')}
          className={cn(
            'nav-tab relative flex items-center gap-2 px-3 pb-2.5 text-sm whitespace-nowrap transition-colors duration-200',
            activeTab === 'payments' ? 'nav-tab--active' : ''
          )}
        >
          Manual Payments
          {activeTab === 'payments' && (
            <motion.div layoutId="finance-tab-glass" className="nav-tab__glass"
              transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
          )}
        </button>
      </div>

      {/* ━━━━━━━━━━━━ ADVANCES TAB ━━━━━━━━━━━━ */}
      <AnimatePresence mode="wait">
        {activeTab === 'advances' && (
          <motion.div
            key="advances"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {/* Toolbar: member selector + action buttons */}
            {isPrivileged && membersWithAdvances.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <select
                  value={advMemberId}
                  onChange={e => setAdvMemberId(e.target.value)}
                  className="glass-input text-sm w-full sm:w-auto sm:min-w-[200px]"
                >
                  <option value="all">View All</option>
                  {membersWithAdvances.map(m => (
                    <option key={m.id} value={m.id}>{getMemberName(m)}</option>
                  ))}
                </select>
                {canManageAdvances && (
                  <div className="flex gap-2 sm:ml-auto">
                    <button onClick={() => { setAdvEditEntry(null); setAdvDialogType('advance'); setAdvDialogOpen(true); }}
                      className="action-btn text-sm flex items-center gap-1.5">
                      <Plus className="w-4 h-4" /> Advance
                    </button>
                    <button onClick={() => { setAdvEditEntry(null); setAdvDialogType('repayment'); setAdvDialogOpen(true); }}
                      className="action-btn action-btn--secondary text-sm flex items-center gap-1.5">
                      <Plus className="w-4 h-4" /> Repayment
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* No members */}
            {isPrivileged && membersWithAdvances.length === 0 && (
              <div className="content-card">
                <div className={cn('p-8 text-center', tints.neutral)}>
                  <Banknote className="w-10 h-10 text-surface-300 mx-auto mb-3" />
                  <p className="text-surface-600 font-medium">No team members with advances enabled</p>
                  <p className="text-sm text-surface-400 mt-1">Go to Team {'>'} edit a member {'>'} enable "Advances tracking"</p>
                </div>
              </div>
            )}

            {(advFilterAll || activeAdvMemberId) && (
              <>
                {/* Balance cards — crew: hero, admin: grid */}
                {!isPrivileged ? (
                  <div className="space-y-3">
                    <div className="content-card">
                      <div className={cn('px-5 py-5 sm:px-6 sm:py-6', tints[balanceTint])}>
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-8 h-8 rounded-lg bg-[rgb(var(--glass-bg))] border border-surface-200/40 flex items-center justify-center">
                            <DollarSign className="w-4 h-4 text-surface-400" />
                          </div>
                          <span className="text-[10px] font-medium text-surface-400 uppercase tracking-[0.08em]">Outstanding Balance</span>
                        </div>
                        <p className={cn(
                          'text-[clamp(1.75rem,5vw,3rem)] font-bold tabular-nums tracking-tight leading-none',
                          valueColors[balanceColor]
                        )}>
                          {formatCurrency(balanceVal)}
                        </p>
                        {balanceVal === 0 && (
                          <p className="text-sm text-[rgb(68,131,97)] mt-2.5 font-medium">All clear — no outstanding balance</p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <HeroCard label="Total Repaid" value={formatCurrency(computedBalance?.totalRepaid || 0)} tint="green" color="green" />
                      <HeroCard label="Total Advanced" value={formatCurrency(computedBalance?.totalAdvanced || 0)} tint="orange" color="orange" />
                    </div>
                  </div>
                ) : (
                  <div>
                    <div
                      ref={statScrollRef}
                      className="flex gap-3 overflow-x-auto scrollbar-hide sm:grid sm:grid-cols-3 sm:overflow-visible"
                      style={{ WebkitOverflowScrolling: 'touch' }}
                    >
                      <div className="shrink-0 sm:shrink min-w-[calc(33.333%-8px)] sm:min-w-0">
                        <HeroCard label="Outstanding Balance"
                          value={formatCurrency(balanceVal)}
                          tint={balanceTint} color={balanceColor} />
                      </div>
                      <div className="shrink-0 sm:shrink min-w-[calc(33.333%-8px)] sm:min-w-0">
                        <HeroCard label="Total Repaid" value={formatCurrency(computedBalance?.totalRepaid || 0)} tint="green" color="green" />
                      </div>
                      <div className="shrink-0 sm:shrink min-w-[calc(33.333%-8px)] sm:min-w-0">
                        <HeroCard label="Total Advanced" value={formatCurrency(computedBalance?.totalAdvanced || 0)} tint="orange" color="orange" />
                      </div>
                    </div>
                    {/* Dot indicators — mobile only */}
                    <div className="flex justify-center gap-1.5 pt-2 sm:hidden">
                      {Array.from({ length: STAT_COUNT }, (_, i) => (
                        <span key={i} className={cn(
                          'w-1.5 h-1.5 rounded-full transition-colors duration-200',
                          i === activeStatIdx ? 'bg-surface-500' : 'bg-surface-200'
                        )} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Advances history */}
                <div className="content-card">
                  <div className="px-4 py-3 border-b border-surface-100">
                    <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-surface-400">History</h2>
                  </div>
                  {advLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin text-surface-300" />
                    </div>
                  ) : advEntries.length === 0 ? (
                    <EmptyState icon={TrendingDown} message="No entries yet" />
                  ) : (
                    <div className="divide-y divide-surface-100/80 px-2">
                      {advEntries.map((entry, i) => (
                        <AdvanceEntryRow key={entry.id} entry={entry} index={i}
                          showMember={advFilterAll}
                          canManage={canManageAdvances}
                          onEdit={(e) => { setAdvEditEntry(e); setAdvDialogOpen(true); }}
                          onDelete={setAdvDeleteTarget} />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Advance form dialog */}
            {advDialogOpen && (advFilterAll || activeAdvMemberId) && (
              <AdvanceFormDialog
                open={advDialogOpen}
                onClose={() => { setAdvDialogOpen(false); setAdvEditEntry(null); }}
                editEntry={advEditEntry}
                teamMemberId={advFilterAll ? '' : activeAdvMemberId}
                teamMembers={advFilterAll ? membersWithAdvances : null}
                type={advDialogType}
              />
            )}

            {/* Advance delete confirmation */}
            <AlertDialog open={!!advDeleteTarget} onOpenChange={() => setAdvDeleteTarget(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete entry?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete this {advDeleteTarget?.type} entry for {formatCurrency(advDeleteTarget?.amount)}.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => { if (advDeleteTarget) deleteAdvance.mutate(advDeleteTarget.id, { onSuccess: () => setAdvDeleteTarget(null) }); }}
                    className="bg-red-500 hover:bg-red-600 text-white"
                  >
                    {deleteAdvance.isPending ? 'Deleting...' : 'Delete'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </motion.div>
        )}

        {/* ━━━━━━━━━━━━ PAYMENTS TAB ━━━━━━━━━━━━ */}
        {activeTab === 'payments' && (
          <motion.div
            key="payments"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {/* Toolbar: member selector + action button */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              {isPrivileged && allMembers.length > 0 && (
                <select
                  value={payMemberId}
                  onChange={e => setPayMemberId(e.target.value)}
                  className="glass-input text-sm w-full sm:w-auto sm:min-w-[200px]"
                >
                  <option value="all">View All</option>
                  {allMembers.map(m => (
                    <option key={m.id} value={m.id}>{getMemberName(m)}</option>
                  ))}
                </select>
              )}
              {canManagePayments && (
                <button onClick={() => { setPayEditEntry(null); setPayDialogOpen(true); }}
                  className="action-btn text-sm flex items-center gap-1.5 sm:ml-auto shrink-0">
                  <Plus className="w-4 h-4" /> Record Payment
                </button>
              )}
            </div>

            {/* No members */}
            {isPrivileged && allMembers.length === 0 && (
              <div className="content-card">
                <div className={cn('p-8 text-center', tints.neutral)}>
                  <Banknote className="w-10 h-10 text-surface-300 mx-auto mb-3" />
                  <p className="text-surface-600 font-medium">No team members</p>
                  <p className="text-sm text-surface-400 mt-1">Add team members first in Team settings</p>
                </div>
              </div>
            )}

            <>
              {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <HeroCard label="Total Paid" value={formatCurrency(totalPaid)} tint="blue" color="blue" />
                  <HeroCard label="Pending" value={pendingCount > 0 ? `${pendingCount} payment${pendingCount !== 1 ? 's' : ''}` : 'None'} tint={pendingCount > 0 ? 'orange' : 'neutral'} color={pendingCount > 0 ? 'orange' : 'default'} />
                </div>

                {/* Payments history */}
                <div className="content-card">
                  <div className="px-4 py-3 border-b border-surface-100">
                    <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-surface-400">Payment History</h2>
                  </div>
                  {payLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin text-surface-300" />
                    </div>
                  ) : payEntries.length === 0 ? (
                    <EmptyState icon={DollarSign} message="No payments recorded yet" />
                  ) : (
                    <div className="divide-y divide-surface-100/80 px-2">
                      {payEntries.map((entry, i) => (
                        <PaymentEntryRow key={entry.id} entry={entry} index={i}
                          showMember={payFilterAll}
                          canManage={canManagePayments}
                          onEdit={(e) => { setPayEditEntry(e); setPayDialogOpen(true); }}
                          onDelete={setPayDeleteTarget} />
                      ))}
                    </div>
                  )}
                </div>
            </>

            {/* Payment form dialog */}
            {payDialogOpen && (
              <PaymentFormDialog
                open={payDialogOpen}
                onClose={() => { setPayDialogOpen(false); setPayEditEntry(null); }}
                editEntry={payEditEntry}
                teamMembers={allMembers}
                selectedMemberId={payFilterAll ? '' : activePayMemberId}
              />
            )}

            {/* Payment delete confirmation */}
            <AlertDialog open={!!payDeleteTarget} onOpenChange={() => setPayDeleteTarget(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete payment?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete this payment of {formatCurrency(payDeleteTarget?.amount)}.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      if (payDeleteTarget) deletePayment.mutate(
                        { id: payDeleteTarget.id, projectId: payDeleteTarget.projectId },
                        { onSuccess: () => setPayDeleteTarget(null) }
                      );
                    }}
                    className="bg-red-500 hover:bg-red-600 text-white"
                  >
                    {deletePayment.isPending ? 'Deleting...' : 'Delete'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default FinanceManager;
