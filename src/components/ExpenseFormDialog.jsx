import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Repeat, Loader2, Users, ArrowDownLeft, Plus } from 'lucide-react';
import { cn, toDateInput } from '@/lib/utils';
import { COLOR_PALETTE } from '@/lib/projectTypes';
import { queryKeys } from '@/lib/queryKeys';
import api from '@/lib/apiClient';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

// Compact toggle switch — Notion-style inline
const MiniToggle = ({ checked, onChange, activeColor = 'bg-blue-400' }) => (
  <label className="relative inline-flex items-center cursor-pointer shrink-0">
    <input type="checkbox" checked={checked} onChange={onChange} className="sr-only peer" />
    <div className={`w-8 h-[18px] bg-surface-200 rounded-full peer peer-checked:${activeColor} after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-[14px] after:w-[14px] after:transition-all after:shadow-sm peer-checked:after:translate-x-[14px]`}
      style={checked ? { backgroundColor: activeColor === 'bg-emerald-400' ? 'rgb(52 211 153)' : 'rgb(96 165 250)' } : undefined}
    />
  </label>
);

// Generic typeahead — type to filter items, create inline if no match
const TypeaheadInput = ({ items, value, onChange, onCreateItem, renderItem, placeholder, queryKeyToInvalidate }) => {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [creating, setCreating] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (value) {
      const item = items.find(i => i.id === value);
      setText(item ? item.name : '');
    } else {
      setText('');
    }
  }, [value, items]);

  const filtered = text.trim()
    ? items.filter(i => i.name.toLowerCase().includes(text.toLowerCase()))
    : items;

  const exactMatch = items.some(i => i.name.toLowerCase() === text.trim().toLowerCase());
  const showCreate = text.trim() && !exactMatch && onCreateItem;
  const showList = focused && (filtered.length > 0 || showCreate);

  const select = useCallback((id, name) => {
    onChange(id);
    setText(name);
    setFocused(false);
  }, [onChange]);

  const handleCreate = useCallback(async () => {
    const name = text.trim();
    if (!name || creating || !onCreateItem) return;
    setCreating(true);
    try {
      const created = await onCreateItem(name);
      if (queryKeyToInvalidate) queryClient.invalidateQueries({ queryKey: queryKeyToInvalidate });
      select(created.id, created.name);
    } catch { /* apiClient handles */ }
    setCreating(false);
  }, [text, creating, onCreateItem, queryKeyToInvalidate, queryClient, select]);

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setFocused(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={text}
        onChange={e => {
          setText(e.target.value);
          if (value) onChange('');
        }}
        onFocus={() => setFocused(true)}
        className="glass-input w-full"
        placeholder={placeholder || 'Type to search...'}
        autoComplete="off"
      />
      {showList && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-[rgb(var(--glass-bg))] border border-surface-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
          {filtered.map(item => (
            <button
              key={item.id}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => select(item.id, item.name)}
              className="w-full text-left px-3 py-2 text-sm text-surface-700 hover:bg-surface-50 transition-colors flex items-center gap-2"
            >
              {renderItem ? renderItem(item) : item.name}
            </button>
          ))}
          {showCreate && (
            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={handleCreate}
              disabled={creating}
              className="w-full text-left px-3 py-2 text-sm text-accent hover:bg-surface-50 transition-colors flex items-center gap-1.5 border-t border-surface-100"
            >
              {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Create &ldquo;{text.trim()}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const ExpenseFormDialog = ({
  expense,
  recurringExpense,
  open,
  onOpenChange,
  categories,
  onSave,
  onSaveRecurring,
  isPending,
  fixedProjectId,
  isTeamPaymentLinked,
  defaultDate,
}) => {
  const [form, setForm] = useState({
    description: '',
    amount: '',
    type: 'expense',
    expenseDate: toDateInput(new Date()),
    categoryId: '',
    projectId: '',
    notes: '',
    isRecurring: false,
    frequency: 'monthly',
    endDate: '',
  });

  const { data: projectsData } = useQuery({
    queryKey: queryKeys.projects.catalog(),
    queryFn: () => api.get('/projects', { pageSize: 200, orderBy: 'title', asc: 'true' }),
    enabled: open && !fixedProjectId,
  });
  const projects = projectsData?.data || [];

  const isEditingRecurring = !!recurringExpense;

  React.useEffect(() => {
    if (open) {
      if (recurringExpense) {
        setForm({
          description: recurringExpense.description || '',
          amount: recurringExpense.amount ? String(recurringExpense.amount) : '',
          type: 'expense',
          expenseDate: recurringExpense.startDate ? toDateInput(recurringExpense.startDate) : toDateInput(new Date()),
          categoryId: recurringExpense.categoryId || '',
          projectId: recurringExpense.projectId || '',
          notes: recurringExpense.notes || '',
          isRecurring: true,
          frequency: recurringExpense.frequency || 'monthly',
          endDate: recurringExpense.endDate ? toDateInput(recurringExpense.endDate) : '',
        });
      } else if (expense) {
        setForm({
          description: expense.description || '',
          amount: expense.amount ? String(expense.amount) : '',
          type: expense.type || 'expense',
          expenseDate: expense.expenseDate ? toDateInput(expense.expenseDate) : toDateInput(new Date()),
          categoryId: expense.categoryId || '',
          projectId: fixedProjectId || expense.projectId || '',
          notes: expense.notes || '',
          isRecurring: false,
          frequency: 'monthly',
          endDate: '',
        });
      } else {
        setForm({
          description: '',
          amount: '',
          type: 'expense',
          expenseDate: defaultDate ? toDateInput(defaultDate) : toDateInput(new Date()),
          categoryId: '',
          projectId: fixedProjectId || '',
          notes: '',
          isRecurring: false,
          frequency: 'monthly',
          endDate: '',
        });
      }
    }
  }, [expense, recurringExpense, open, fixedProjectId, defaultDate]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isTeamPaymentLinked) {
      onSave({
        amount: parseFloat(form.amount),
        expenseDate: form.expenseDate,
        notes: form.notes || null,
        projectId: fixedProjectId || form.projectId || null,
      });
      return;
    }
    if (!form.description.trim() || !form.amount) return;

    const base = {
      description: form.description,
      amount: parseFloat(form.amount),
      type: form.type,
      categoryId: form.categoryId || null,
      projectId: fixedProjectId || form.projectId || null,
      notes: form.notes || null,
    };

    if (form.isRecurring) {
      onSaveRecurring({
        ...base,
        frequency: form.frequency,
        startDate: form.expenseDate,
        nextDueDate: form.expenseDate,
        endDate: form.endDate || null,
      });
    } else {
      onSave({
        ...base,
        expenseDate: form.expenseDate,
      });
    }
  };

  const isCredit = form.type === 'credit';

  const dialogTitle = isTeamPaymentLinked
    ? 'Edit Team Payment'
    : isEditingRecurring
      ? 'Edit Recurring Expense'
      : expense
        ? (isCredit ? 'Edit Credit' : 'Edit Expense')
        : (isCredit ? 'Add Credit' : 'Add Expense');

  const submitLabel = isTeamPaymentLinked
    ? 'Update'
    : isEditingRecurring
      ? 'Update'
      : expense ? 'Update' : form.isRecurring ? 'Create Subscription' : (isCredit ? 'Add Credit' : 'Add Expense');

  // Whether to show the options section (credit + recurring toggles)
  const showOptions = !isTeamPaymentLinked && !isEditingRecurring;
  // Whether to show the recurring toggle specifically (not when editing existing, not credit)
  const showRecurringOption = showOptions && !expense && !isCredit;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onOpenAutoFocus={e => e.preventDefault()} className="glass-card fixed inset-0 translate-x-0 translate-y-0 top-0 left-0 max-h-full w-full rounded-none sm:inset-auto sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:max-w-lg sm:max-h-[90vh] sm:rounded-lg flex flex-col overflow-hidden">
        <DialogHeader className="border-b border-surface-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] pb-4 flex-shrink-0">
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-1 py-4 space-y-4">
          {/* Team payment info banner */}
          {isTeamPaymentLinked && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-teal-50 border border-teal-200 text-xs text-teal-700">
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span>Linked to team payment &mdash; changes will sync</span>
            </div>
          )}

          {/* ── Main Fields ── */}

          {/* Description — first and prominent */}
          {!isTeamPaymentLinked && (
            <div>
              <label className="text-xs font-medium text-surface-600 mb-1 block">Description *</label>
              <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="glass-input w-full" placeholder={isCredit ? 'e.g. Sold Canon 70-200mm lens' : 'e.g. Adobe Creative Cloud'} required />
            </div>
          )}

          {/* Amount + Date — side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-surface-600 mb-1 block">Amount *</label>
              <input type="number" inputMode="decimal" step="0.01" min="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="glass-input w-full" placeholder="0.00" required />
            </div>
            {/* Date — hidden when editing recurring template */}
            {!isEditingRecurring ? (
              <div>
                <label className="text-xs font-medium text-surface-600 mb-1 block">Date *</label>
                <input type="date" value={form.expenseDate} onChange={e => setForm({ ...form, expenseDate: e.target.value })} className="glass-input w-full" required />
              </div>
            ) : (
              <div /> /* empty grid cell */
            )}
          </div>

          {/* Category — hidden for team payment linked */}
          {!isTeamPaymentLinked && (
            <div>
              <label className="text-xs font-medium text-surface-600 mb-1 block">Category *</label>
              <TypeaheadInput
                items={categories}
                value={form.categoryId}
                onChange={id => setForm({ ...form, categoryId: id })}
                placeholder="Type to search..."
                queryKeyToInvalidate={queryKeys.expenseCategories.all}
                onCreateItem={async (name) => {
                  const res = await api.post('/expense-categories', { name, color: 'slate', sortOrder: categories.length });
                  return res.data;
                }}
                renderItem={(item) => {
                  const colors = COLOR_PALETTE[item.color] || COLOR_PALETTE.slate;
                  return (<><span className={cn('w-2 h-2 rounded-full shrink-0', colors.dot)} />{item.name}</>);
                }}
              />
            </div>
          )}

          {/* Project — hidden when fixedProjectId is set */}
          {!fixedProjectId && !isTeamPaymentLinked && (
            <div>
              <label className="text-xs font-medium text-surface-600 mb-1 block">Project</label>
              <select value={form.projectId} onChange={e => setForm({ ...form, projectId: e.target.value })} className="glass-input w-full">
                <option value="">No project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-surface-600 mb-1 block">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="glass-input w-full resize-none" rows={2} placeholder="Optional notes..." />
          </div>

          {/* ── Options Section — compact toggles grouped together ── */}
          {(showOptions || isEditingRecurring) && (
            <div className="border-t border-surface-100 pt-3 space-y-2.5">
              {/* Credit toggle */}
              {showOptions && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ArrowDownLeft className="w-3.5 h-3.5 text-surface-400" />
                    <span className="text-xs text-surface-600">Income / Credit</span>
                  </div>
                  <MiniToggle
                    checked={isCredit}
                    onChange={e => setForm({ ...form, type: e.target.checked ? 'credit' : 'expense', isRecurring: false })}
                    activeColor="bg-emerald-400"
                  />
                </div>
              )}

              {/* Recurring toggle */}
              {showRecurringOption && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Repeat className="w-3.5 h-3.5 text-surface-400" />
                    <span className="text-xs text-surface-600">Recurring</span>
                  </div>
                  <MiniToggle
                    checked={form.isRecurring}
                    onChange={e => setForm({ ...form, isRecurring: e.target.checked })}
                    activeColor="bg-blue-400"
                  />
                </div>
              )}

              {/* Recurring fields — indented */}
              {(form.isRecurring || isEditingRecurring) && !isTeamPaymentLinked && (
                <div className="space-y-3 pl-3 ml-1 border-l-2 border-blue-200 pt-1">
                  <div>
                    <label className="text-xs font-medium text-surface-600 mb-1 block">Frequency *</label>
                    <select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} className="glass-input w-full">
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>

                  {isEditingRecurring && (
                    <div>
                      <label className="text-xs font-medium text-surface-600 mb-1 block">Start Date</label>
                      <input type="date" value={form.expenseDate} onChange={e => setForm({ ...form, expenseDate: e.target.value })} className="glass-input w-full" />
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-medium text-surface-600 mb-1 block">End Date</label>
                    <input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} className="glass-input w-full" />
                    <p className="text-[10px] text-surface-400 mt-1">Leave empty for indefinite</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>

        <DialogFooter className="pt-4 flex-shrink-0 gap-3 border-t border-surface-100 shadow-[0_-1px_3px_rgba(0,0,0,0.04)]">
          <button type="button" onClick={() => onOpenChange(false)} className="action-btn action-btn--secondary flex-1 sm:flex-none">Cancel</button>
          <button type="submit" onClick={handleSubmit} disabled={isPending} className="action-btn flex-1 sm:flex-none">
            {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {submitLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExpenseFormDialog;
