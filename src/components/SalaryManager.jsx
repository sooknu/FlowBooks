import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Wallet, Plus, Loader2, Edit2, Trash2, ArrowDownLeft, ArrowUpRight, DollarSign, TrendingDown, Calendar,
} from 'lucide-react';
import { cn, fmtDate, tzDate, toDateInput } from '@/lib/utils';
import { queryKeys } from '@/lib/queryKeys';
import { useCreateTeamSalary, useUpdateTeamSalary, useDeleteTeamSalary } from '@/hooks/useMutations';
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

function formatPeriod(start, end) {
  if (!start || !end) return null;
  return `${fmtDate(start, { month: 'short', day: 'numeric' })} \u2013 ${fmtDate(end, { month: 'short', day: 'numeric' })}`;
}

function getMemberName(entry) {
  if (entry.memberDisplayName) return entry.memberDisplayName;
  const first = entry.memberFirstName || '';
  const last = entry.memberLastName || '';
  if (first || last) return `${first} ${last}`.trim();
  return entry.memberEmail || 'Unknown';
}

// ─── Stat Card ─────────────────────────────────────────────────────────────

const StatCard = ({ label, value, icon: Icon, accent }) => (
  <div className="flex items-center gap-3 rounded-xl border border-surface-200/60 bg-white px-4 py-3.5 flex-1 min-w-0">
    <div className="w-9 h-9 rounded-lg bg-surface-100 flex items-center justify-center shrink-0">
      <Icon className="w-[18px] h-[18px] text-surface-400" />
    </div>
    <div className="min-w-0">
      <p className={`text-xl font-bold tabular-nums leading-none ${accent || ''}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1 whitespace-nowrap">{label}</p>
    </div>
  </div>
);

// ─── Salary Form Dialog ─────────────────────────────────────────────────

const SalaryFormDialog = ({ open, onClose, editEntry, teamMemberId, type: defaultType, members }) => {
  const createSalary = useCreateTeamSalary();
  const updateSalary = useUpdateTeamSalary();
  const isEditing = !!editEntry;

  const [form, setForm] = useState(() => editEntry ? {
    teamMemberId: editEntry.teamMemberId || teamMemberId || '',
    type: editEntry.type,
    amount: String(editEntry.amount),
    description: editEntry.description || '',
    entryDate: editEntry.entryDate ? toDateInput(editEntry.entryDate) : toDateInput(new Date()),
  } : {
    teamMemberId: teamMemberId || (members?.length === 1 ? members[0].id : ''),
    type: defaultType || 'accrued',
    amount: '',
    description: '',
    entryDate: toDateInput(new Date()),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.amount || !form.teamMemberId) return;

    const payload = {
      teamMemberId: form.teamMemberId,
      type: form.type,
      amount: parseFloat(form.amount),
      description: form.description || (form.type === 'accrued' ? 'Manual salary accrual' : 'Manual salary payment'),
      entryDate: form.entryDate,
    };

    if (isEditing) {
      updateSalary.mutate({ id: editEntry.id, ...payload }, { onSuccess: onClose });
    } else {
      createSalary.mutate(payload, { onSuccess: onClose });
    }
  };

  const isPending = createSalary.isPending || updateSalary.isPending;

  if (!open) return null;

  const memberName = (id) => {
    const m = members?.find(m => m.id === id);
    if (!m) return '';
    return m.displayName || m.userName || m.userEmail || 'Unknown';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100">
          <h3 className="text-base font-semibold text-surface-800">
            {isEditing ? 'Edit Entry' : form.type === 'accrued' ? 'Record Accrual' : 'Record Payment'}
          </h3>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-600 text-lg">&times;</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {/* Team member picker */}
          {members && members.length > 0 && (
            <div>
              <label className="text-xs font-medium text-surface-500 mb-1 block">Team Member</label>
              <select
                value={form.teamMemberId}
                onChange={e => setForm(f => ({ ...f, teamMemberId: e.target.value }))}
                className="glass-input w-full text-sm"
                required
              >
                <option value="">Select member...</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.displayName || m.userName || m.userEmail || 'Unknown'}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!isEditing && (
            <div>
              <label className="text-xs font-medium text-surface-500 mb-1 block">Type</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, type: 'accrued' }))}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                    form.type === 'accrued'
                      ? 'border-blue-300 bg-blue-50 text-blue-700'
                      : 'border-surface-200 bg-white text-surface-500 hover:bg-surface-50'
                  }`}
                >
                  Accrued (owed)
                </button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, type: 'paid' }))}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                    form.type === 'paid'
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-surface-200 bg-white text-surface-500 hover:bg-surface-50'
                  }`}
                >
                  Paid
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
              placeholder={form.type === 'accrued' ? 'e.g. Weekly salary' : 'e.g. Paid from gig earnings'}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-surface-500 mb-1 block">Date</label>
            <input
              type="date"
              value={form.entryDate}
              onChange={e => setForm(f => ({ ...f, entryDate: e.target.value }))}
              className="glass-input w-full"
            />
          </div>

          {/* Footer */}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="action-btn action-btn--secondary flex-1">Cancel</button>
            <button type="submit" disabled={isPending || !form.teamMemberId} className="action-btn flex-1">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : isEditing ? 'Save' : 'Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Entry Row ───────────────────────────────────────────────────────────

const EntryRow = ({ entry, canManage, onEdit, onDelete, showMember }) => {
  const { month, day } = formatDateShort(entry.entryDate);
  const isAccrued = entry.type === 'accrued';
  const period = formatPeriod(entry.periodStart, entry.periodEnd);

  return (
    <div className="flex items-center gap-3 py-3.5 px-3 -mx-1 rounded-xl hover:bg-surface-50 transition-colors group">
      {/* Date block */}
      <div className="w-11 h-11 rounded-lg bg-surface-50 border border-surface-200/60 flex flex-col items-center justify-center shrink-0">
        <span className="text-[9px] font-semibold text-surface-400 leading-none">{month}</span>
        <span className="text-[15px] font-bold text-surface-700 leading-tight">{day}</span>
      </div>

      {/* Description + type badge + member */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-surface-800 leading-tight truncate">{entry.description}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
            isAccrued ? 'text-blue-600 bg-blue-50' : 'text-emerald-600 bg-emerald-50'
          }`}>
            {isAccrued ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
            {isAccrued ? 'Accrued' : 'Paid'}
          </span>
          {showMember && (
            <span className="text-[11px] font-medium text-surface-500 bg-surface-100 px-1.5 py-0.5 rounded-full truncate max-w-[120px]">
              {getMemberName(entry)}
            </span>
          )}
          {period && (
            <span className="inline-flex items-center gap-1 text-[11px] text-surface-400">
              <Calendar className="w-3 h-3" />
              {period}
            </span>
          )}
        </div>
      </div>

      {/* Amount */}
      <div className="text-right shrink-0">
        <p className={`text-sm font-bold tabular-nums ${isAccrued ? 'text-blue-600' : 'text-emerald-600'}`}>
          {isAccrued ? '+' : '-'}{formatCurrency(entry.amount)}
        </p>
      </div>

      {/* Actions */}
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

const SalaryManager = () => {
  const { isPrivileged, teamMemberId, can } = useAppData();
  const canManageSalary = can('manage_salary');
  const canViewSalary = can('view_salary') || canManageSalary;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState('accrued');
  const [editEntry, setEditEntry] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filterMemberId, setFilterMemberId] = useState('');
  const deleteSalary = useDeleteTeamSalary();

  // Fetch team members with salary enabled (privileged users)
  const { data: teamData } = useQuery({
    queryKey: [...queryKeys.team.all, 'salary-members'],
    queryFn: () => api.get('/team').then(r => r.data || []),
    enabled: canViewSalary,
  });

  const membersWithSalary = useMemo(() => (teamData || []).filter(m => m.salaryEnabled), [teamData]);

  // Fetch ALL entries (backend filters based on permission)
  const { data: entries = [], isLoading } = useQuery({
    queryKey: queryKeys.teamSalary.list({}),
    queryFn: () => api.get('/team-salary').then(r => r.data || []),
    enabled: canViewSalary || !!teamMemberId,
  });

  // For crew: fetch own entries only
  const { data: ownEntries = [], isLoading: ownLoading } = useQuery({
    queryKey: queryKeys.teamSalary.list({ teamMemberId }),
    queryFn: () => api.get('/team-salary', { teamMemberId }).then(r => r.data || []),
    enabled: !canViewSalary && !!teamMemberId,
  });

  const allEntries = canViewSalary ? entries : ownEntries;
  const loading = canViewSalary ? isLoading : ownLoading;

  // Filter by member
  const filteredEntries = useMemo(() => {
    if (!filterMemberId) return allEntries;
    return allEntries.filter(e => e.teamMemberId === filterMemberId);
  }, [allEntries, filterMemberId]);

  // Compute aggregated stats
  const stats = useMemo(() => {
    const src = filteredEntries;
    let totalAccrued = 0;
    let totalPaid = 0;
    for (const e of src) {
      if (e.type === 'accrued') totalAccrued += parseFloat(e.amount) || 0;
      else totalPaid += parseFloat(e.amount) || 0;
    }
    return { totalAccrued, totalPaid, balance: totalAccrued - totalPaid };
  }, [filteredEntries]);

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
      deleteSalary.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
    }
  };

  // Crew without teamMemberId — no data
  if (!canViewSalary && !teamMemberId) {
    return (
      <div className="text-center py-20">
        <p className="text-surface-500">Salary data is not available.</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 rounded-xl bg-surface-100 flex items-center justify-center shrink-0">
            <Wallet className="w-5 h-5 text-surface-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-surface-800">Salary</h1>
            <p className="text-sm text-surface-500">Track salary accruals and payments</p>
          </div>
        </div>

        {/* Filter by member (privileged only) */}
        {canViewSalary && membersWithSalary.length > 1 && (
          <select
            value={filterMemberId}
            onChange={e => setFilterMemberId(e.target.value)}
            className="glass-input text-sm w-full sm:w-auto sm:min-w-[200px]"
          >
            <option value="">All Members</option>
            {membersWithSalary.map(m => (
              <option key={m.id} value={m.id}>
                {m.displayName || m.userName || m.userEmail || 'Unknown'}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* No members with salary enabled */}
      {canViewSalary && membersWithSalary.length === 0 && (
        <div className="glass-card p-8 text-center">
          <Wallet className="w-10 h-10 text-surface-300 mx-auto mb-3" />
          <p className="text-surface-600 font-medium">No team members with salary enabled</p>
          <p className="text-sm text-surface-400 mt-1">Go to Team {'>'} edit a member {'>'} enable "Salary tracking"</p>
        </div>
      )}

      {/* Crew: hero balance card for own salary */}
      {!canViewSalary && teamMemberId && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-surface-200/60 bg-white px-5 py-5 sm:px-6 sm:py-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-surface-400" />
              </div>
              <span className="text-xs font-medium text-surface-500 uppercase tracking-wide">
                {stats.balance > 0 ? 'Company Owes You' : 'Salary Balance'}
              </span>
            </div>
            <p className={`text-4xl sm:text-5xl font-extrabold tabular-nums tracking-tight leading-none ${
              stats.balance > 0 ? 'text-emerald-600' : 'text-surface-800'
            }`}>
              {formatCurrency(stats.balance)}
            </p>
            {stats.balance === 0 && (
              <p className="text-sm text-surface-400 mt-2 font-medium">All caught up</p>
            )}
          </div>
          <div>
            <StatCard label="Total Paid" value={formatCurrency(stats.totalPaid)} icon={ArrowDownLeft} />
          </div>
        </div>
      )}

      {/* Privileged: stat cards */}
      {canViewSalary && (membersWithSalary.length > 0 || allEntries.length > 0) && (
        <div className="flex gap-3 sm:grid sm:grid-cols-2">
          <StatCard
            label="Balance Owed"
            value={formatCurrency(stats.balance)}
            icon={DollarSign}
            accent={stats.balance > 0 ? 'text-red-500' : ''}
          />
          <StatCard label="Total Paid" value={formatCurrency(stats.totalPaid)} icon={ArrowDownLeft} accent="text-emerald-600" />
        </div>
      )}

      {/* Action buttons (manage_salary only) */}
      {canManageSalary && membersWithSalary.length > 0 && (
        <div className="flex gap-2">
          <button onClick={() => handleOpenAdd('accrued')} className="action-btn text-sm flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Record Accrual
          </button>
          <button onClick={() => handleOpenAdd('paid')} className="action-btn action-btn--secondary text-sm flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Record Payment
          </button>
        </div>
      )}

      {/* Entries list */}
      {(canViewSalary ? membersWithSalary.length > 0 || allEntries.length > 0 : !!teamMemberId) && (
        <div className="glass-card">
          <div className="px-4 py-3 border-b border-surface-100">
            <h2 className="text-sm font-semibold text-surface-700">History</h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-surface-300" />
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="py-12 text-center">
              <TrendingDown className="w-8 h-8 text-surface-200 mx-auto mb-2" />
              <p className="text-sm text-surface-400">No entries yet</p>
            </div>
          ) : (
            <div className="divide-y divide-surface-100 px-2">
              {filteredEntries.map(entry => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  canManage={canManageSalary}
                  onEdit={handleEdit}
                  onDelete={setDeleteTarget}
                  showMember={canViewSalary && !filterMemberId}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Dialog */}
      {dialogOpen && (
        <SalaryFormDialog
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); setEditEntry(null); }}
          editEntry={editEntry}
          teamMemberId={!canViewSalary ? teamMemberId : null}
          type={dialogType}
          members={canManageSalary ? membersWithSalary : null}
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
              {deleteSalary.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
};

export default SalaryManager;
