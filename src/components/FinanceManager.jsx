import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Banknote, Plus, Loader2, Edit2, Trash2, ArrowDownLeft, ArrowUpRight, DollarSign, TrendingDown,
} from 'lucide-react';
import { cn, fmtDate, tzDate, toDateInput } from '@/lib/utils';
import { queryKeys } from '@/lib/queryKeys';
import { useCreateTeamAdvance, useUpdateTeamAdvance, useDeleteTeamAdvance } from '@/hooks/useMutations';
import { useAppData } from '@/hooks/useAppData';
import api from '@/lib/apiClient';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function formatCurrency(n) {
  return '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d) {
  if (!d) return '';
  return fmtDate(d, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateShort(d) {
  if (!d) return { month: '', day: '' };
  const dt = tzDate(d);
  return {
    month: fmtDate(d, { month: 'short' }).toUpperCase(),
    day: dt.getDate(),
  };
}

// ─── Stat Card ─────────────────────────────────────────────────────────────

const StatCard = ({ label, value, icon: Icon, accent, snap }) => (
  <div className={cn(
    "flex items-center gap-3 rounded-xl border border-surface-200/60 bg-white px-4 py-3.5 shrink-0 sm:shrink sm:min-w-0",
    snap && "min-w-[calc(33.333%-8px)] snap-start"
  )}>
    <div className="w-9 h-9 rounded-lg bg-surface-100 flex items-center justify-center shrink-0">
      <Icon className="w-[18px] h-[18px] text-surface-400" />
    </div>
    <div className="min-w-0">
      <p className={`text-xl font-bold tabular-nums leading-none ${accent || ''}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1 whitespace-nowrap">{label}</p>
    </div>
  </div>
);

// ─── Advance Form Dialog ─────────────────────────────────────────────────

const AdvanceFormDialog = ({ open, onClose, editEntry, teamMemberId, type: defaultType }) => {
  const createAdvance = useCreateTeamAdvance();
  const updateAdvance = useUpdateTeamAdvance();
  const isEditing = !!editEntry;

  const [form, setForm] = useState(() => editEntry ? {
    type: editEntry.type,
    amount: String(editEntry.amount),
    description: editEntry.description,
    advanceDate: editEntry.advanceDate ? toDateInput(editEntry.advanceDate) : toDateInput(new Date()),
  } : {
    type: defaultType || 'advance',
    amount: '',
    description: '',
    advanceDate: toDateInput(new Date()),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.amount || !form.description) return;

    const payload = {
      teamMemberId,
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
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100">
          <h3 className="text-base font-semibold text-surface-800">
            {isEditing ? 'Edit Entry' : form.type === 'advance' ? 'Record Advance' : 'Record Repayment'}
          </h3>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-600 text-lg">&times;</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {!isEditing && (
            <div>
              <label className="text-xs font-medium text-surface-500 mb-1 block">Type</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, type: 'advance' }))}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                    form.type === 'advance'
                      ? 'border-orange-300 bg-orange-50 text-orange-700'
                      : 'border-surface-200 bg-white text-surface-500 hover:bg-surface-50'
                  }`}
                >
                  Advance (lent)
                </button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, type: 'repayment' }))}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                    form.type === 'repayment'
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-surface-200 bg-white text-surface-500 hover:bg-surface-50'
                  }`}
                >
                  Repayment
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-surface-500 mb-1 block">Amount ($)</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className="glass-input w-full"
              placeholder="0.00"
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium text-surface-500 mb-1 block">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="glass-input w-full"
              placeholder={form.type === 'advance' ? 'e.g. sweater, gas money' : 'e.g. deducted from gig payment'}
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium text-surface-500 mb-1 block">Date</label>
            <input
              type="date"
              value={form.advanceDate}
              onChange={e => setForm(f => ({ ...f, advanceDate: e.target.value }))}
              className="glass-input w-full"
            />
          </div>

          {/* Footer */}
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

// ─── Entry Row ───────────────────────────────────────────────────────────

const EntryRow = ({ entry, canManage, onEdit, onDelete }) => {
  const { month, day } = formatDateShort(entry.advanceDate);
  const isAdvance = entry.type === 'advance';

  return (
    <div className="flex items-center gap-3 py-3.5 px-3 -mx-1 rounded-xl hover:bg-surface-50 transition-colors group">
      {/* Date block */}
      <div className="w-11 h-11 rounded-lg bg-surface-50 border border-surface-200/60 flex flex-col items-center justify-center shrink-0">
        <span className="text-[9px] font-semibold text-surface-400 leading-none">{month}</span>
        <span className="text-[15px] font-bold text-surface-700 leading-tight">{day}</span>
      </div>

      {/* Description + type badge */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-surface-800 leading-tight truncate">{entry.description}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
            isAdvance ? 'text-orange-600 bg-orange-50' : 'text-emerald-600 bg-emerald-50'
          }`}>
            {isAdvance ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
            {isAdvance ? 'Advance' : 'Repayment'}
          </span>
          {entry.projectTitle && (
            <span className="text-[11px] text-surface-400 truncate">{entry.projectTitle}</span>
          )}
        </div>
      </div>

      {/* Amount */}
      <div className="text-right shrink-0">
        <p className={`text-sm font-bold tabular-nums ${isAdvance ? 'text-orange-600' : 'text-emerald-600'}`}>
          {isAdvance ? '-' : '+'}{formatCurrency(entry.amount)}
        </p>
      </div>

      {/* Actions (admin only) */}
      {canManage && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={() => onEdit(entry)} className="p-1.5 rounded-md text-surface-400 hover:text-surface-600 hover:bg-surface-100">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(entry)} className="p-1.5 rounded-md text-surface-400 hover:text-red-500 hover:bg-red-50">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────

const FinanceManager = () => {
  const { isPrivileged, teamMemberId, can } = useAppData();
  const canManageAdvances = can('manage_advances');
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState('advance');
  const [editEntry, setEditEntry] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const deleteAdvance = useDeleteTeamAdvance();

  const activeMemberId = isPrivileged ? selectedMemberId : teamMemberId;

  // Fetch team members with advances enabled (admin only)
  const { data: teamData } = useQuery({
    queryKey: [...queryKeys.team.all, 'advances-members'],
    queryFn: () => api.get('/team').then(r => r.data || []),
    enabled: isPrivileged,
  });

  const membersWithAdvances = (teamData || []).filter(m => m.advancesEnabled);

  // Auto-select first member if admin and none selected
  React.useEffect(() => {
    if (isPrivileged && !selectedMemberId && membersWithAdvances.length > 0) {
      setSelectedMemberId(membersWithAdvances[0].id);
    }
  }, [isPrivileged, selectedMemberId, membersWithAdvances]);

  // Fetch balance
  const { data: balance } = useQuery({
    queryKey: queryKeys.teamAdvances.balance(activeMemberId),
    queryFn: () => api.get(`/team-advances/balance/${activeMemberId}`),
    enabled: !!activeMemberId,
  });

  // Stat cards scroll-snap dot tracking
  const statScrollRef = useRef(null);
  const [activeStatIdx, setActiveStatIdx] = useState(0);
  const STAT_COUNT = 3;

  const checkActiveCard = useCallback(() => {
    const el = statScrollRef.current;
    if (!el || !el.children.length) return;
    const card = el.children[0];
    const cardWidth = card.offsetWidth + 12; // card width + gap-3
    const idx = Math.round(el.scrollLeft / cardWidth);
    setActiveStatIdx(Math.min(idx, STAT_COUNT - 1));
  }, []);

  useEffect(() => {
    const el = statScrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkActiveCard, { passive: true });
    return () => el.removeEventListener('scroll', checkActiveCard);
  }, [checkActiveCard, !!balance]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch entries
  const { data: entries = [], isLoading } = useQuery({
    queryKey: queryKeys.teamAdvances.list({ teamMemberId: activeMemberId }),
    queryFn: () => api.get('/team-advances', { teamMemberId: activeMemberId }).then(r => r.data || []),
    enabled: !!activeMemberId,
  });

  const handleOpenAdd = (type) => {
    setEditEntry(null);
    setDialogType(type);
    setDialogOpen(true);
  };

  const handleEdit = (entry) => {
    setEditEntry(entry);
    setDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (deleteTarget) {
      deleteAdvance.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
    }
  };

  const getMemberName = (m) => {
    if (!m) return '';
    return m.displayName || m.userName || m.userEmail || 'Unknown';
  };

  if (!isPrivileged && !teamMemberId) {
    return (
      <div className="text-center py-20">
        <p className="text-surface-500">Finance data is not available.</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 rounded-xl bg-surface-100 flex items-center justify-center shrink-0">
            <Banknote className="w-5 h-5 text-surface-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-surface-800">Advances</h1>
            <p className="text-sm text-surface-500">Track advances and repayments</p>
          </div>
        </div>

        {/* Admin: member selector */}
        {isPrivileged && membersWithAdvances.length > 0 && (
          <select
            value={selectedMemberId || ''}
            onChange={e => setSelectedMemberId(e.target.value)}
            className="glass-input text-sm w-full sm:w-auto sm:min-w-[200px]"
          >
            {membersWithAdvances.map(m => (
              <option key={m.id} value={m.id}>{getMemberName(m)}</option>
            ))}
          </select>
        )}
      </div>

      {/* No members with advances enabled */}
      {isPrivileged && membersWithAdvances.length === 0 && (
        <div className="glass-card p-8 text-center">
          <Banknote className="w-10 h-10 text-surface-300 mx-auto mb-3" />
          <p className="text-surface-600 font-medium">No team members with advances enabled</p>
          <p className="text-sm text-surface-400 mt-1">Go to Team {'>'} edit a member {'>'} enable "Advances tracking"</p>
        </div>
      )}

      {activeMemberId && (
        <>
          {/* Balance cards — crew: hero layout, admin: 3-col grid */}
          {!isPrivileged ? (
            <div className="space-y-3">
              {/* Hero balance card */}
              <div className="rounded-2xl border border-surface-200/60 bg-white px-5 py-5 sm:px-6 sm:py-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center">
                    <DollarSign className="w-4 h-4 text-surface-400" />
                  </div>
                  <span className="text-xs font-medium text-surface-500 uppercase tracking-wide">Outstanding Balance</span>
                </div>
                <p className={`text-4xl sm:text-5xl font-extrabold tabular-nums tracking-tight leading-none ${
                  (balance?.balance || 0) > 0 ? 'text-orange-600' : 'text-emerald-600'
                }`}>
                  {formatCurrency(balance?.balance || 0)}
                </p>
                {(balance?.balance || 0) === 0 && (
                  <p className="text-sm text-emerald-500 mt-2 font-medium">All clear — no outstanding balance</p>
                )}
              </div>

              {/* Secondary stats */}
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Total Repaid" value={formatCurrency(balance?.totalRepaid || 0)} icon={ArrowDownLeft} />
                <StatCard label="Total Advanced" value={formatCurrency(balance?.totalAdvanced || 0)} icon={ArrowUpRight} />
              </div>
            </div>
          ) : (
            <div>
              <div
                ref={statScrollRef}
                className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide sm:grid sm:grid-cols-3 sm:snap-none sm:overflow-visible"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                <StatCard snap
                  label="Outstanding Balance"
                  value={formatCurrency(balance?.balance || 0)}
                  icon={DollarSign}
                  accent={(balance?.balance || 0) > 0 ? 'text-orange-600' : 'text-emerald-600'}
                />
                <StatCard snap label="Total Repaid" value={formatCurrency(balance?.totalRepaid || 0)} icon={ArrowDownLeft} />
                <StatCard snap label="Total Advanced" value={formatCurrency(balance?.totalAdvanced || 0)} icon={ArrowUpRight} />
              </div>
              {/* Dot indicators — mobile only */}
              <div className="flex justify-center gap-1.5 pt-2 sm:hidden">
                {Array.from({ length: STAT_COUNT }, (_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "w-1.5 h-1.5 rounded-full transition-colors duration-200",
                      i === activeStatIdx ? "bg-surface-500" : "bg-surface-200"
                    )}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Action buttons (manage_advances only) */}
          {canManageAdvances && (
            <div className="flex gap-2">
              <button onClick={() => handleOpenAdd('advance')} className="action-btn text-sm flex items-center gap-1.5">
                <Plus className="w-4 h-4" /> Record Advance
              </button>
              <button onClick={() => handleOpenAdd('repayment')} className="action-btn action-btn--secondary text-sm flex items-center gap-1.5">
                <Plus className="w-4 h-4" /> Record Repayment
              </button>
            </div>
          )}

          {/* Entries list */}
          <div className="glass-card">
            <div className="px-4 py-3 border-b border-surface-100">
              <h2 className="text-sm font-semibold text-surface-700">History</h2>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-surface-300" />
              </div>
            ) : entries.length === 0 ? (
              <div className="py-12 text-center">
                <TrendingDown className="w-8 h-8 text-surface-200 mx-auto mb-2" />
                <p className="text-sm text-surface-400">No entries yet</p>
              </div>
            ) : (
              <div className="divide-y divide-surface-100 px-2">
                {entries.map(entry => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    canManage={canManageAdvances}
                    onEdit={handleEdit}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Add/Edit Dialog */}
      {dialogOpen && activeMemberId && (
        <AdvanceFormDialog
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); setEditEntry(null); }}
          editEntry={editEntry}
          teamMemberId={activeMemberId}
          type={dialogType}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this {deleteTarget?.type} entry for {formatCurrency(deleteTarget?.amount)}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {deleteAdvance.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
};

export default FinanceManager;
