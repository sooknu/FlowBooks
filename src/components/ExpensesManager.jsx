import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wallet, Plus, Search, X, Loader2, Edit2, Trash2, ChevronRight,
  TrendingDown, Calendar as CalendarIcon, DollarSign, FolderKanban,
  Repeat, Pause, Play, Users, ArrowUpDown,
} from 'lucide-react';
import { cn, fmtDate } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';
import { queryKeys } from '@/lib/queryKeys';
import {
  useCreateExpense, useUpdateExpense, useDeleteExpense,
  useCreateRecurringExpense, useUpdateRecurringExpense, useToggleRecurringExpense, useDeleteRecurringExpense,
} from '@/hooks/useMutations';
import { COLOR_PALETTE } from '@/lib/projectTypes';
import api from '@/lib/apiClient';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useDebounce } from '@/hooks/useDebounce';
import ExpenseFormDialog from '@/components/ExpenseFormDialog';

const PAGE_SIZE = 50;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FREQUENCY_LABELS = { weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };

function formatCurrency(n) {
  return '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatCompact(n) {
  if (n >= 1000) return '$' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return '$' + Math.round(n);
}

// ─── Stat Card ─────────────────────────────────────────────────────────────

const StatCard = ({ label, value, icon: Icon }) => (
  <div className="flex items-center gap-3 rounded-xl border border-surface-200/60 bg-[rgb(var(--glass-bg))] px-4 py-3.5 min-w-[calc(50%-6px)] shrink-0 sm:min-w-0 sm:shrink">
    <div className="w-9 h-9 rounded-lg bg-surface-100 flex items-center justify-center shrink-0">
      <Icon className="w-[18px] h-[18px] text-surface-400" />
    </div>
    <div className="min-w-0">
      <p className="text-xl font-bold tabular-nums leading-none">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1 whitespace-nowrap">{label}</p>
    </div>
  </div>
);

// ─── Category Bar ──────────────────────────────────────────────────────────

const CategoryBar = ({ name, color, total, maxTotal }) => {
  const palette = COLOR_PALETTE[color] || COLOR_PALETTE.amber;
  const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;

  return (
    <div className="flex items-center gap-3">
      <span className={cn('w-2 h-2 rounded-full shrink-0', palette.dot)} />
      <span className="text-xs text-surface-600 w-24 truncate">{name || 'Uncategorized'}</span>
      <div className="flex-1 h-2 rounded-full bg-surface-100 overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', palette.bar)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-surface-500 tabular-nums w-16 text-right">{formatCompact(total)}</span>
    </div>
  );
};

// ─── Monthly Trend ─────────────────────────────────────────────────────────

const MonthlyTrend = ({ byMonth }) => {
  const monthMap = {};
  for (const m of byMonth) monthMap[m.month] = m.total;
  const data = MONTHS.map((_, i) => monthMap[i + 1] || 0);
  const max = Math.max(...data, 1);
  const currentMonth = new Date().getMonth();

  return (
    <div className="flex items-end gap-1 h-20">
      {data.map((val, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div
            className={cn(
              'w-full rounded-t transition-all',
              i === currentMonth ? 'bg-surface-700' : 'bg-surface-200',
            )}
            style={{ height: `${Math.max((val / max) * 100, 2)}%` }}
          />
          <span className={cn('text-[9px]', i === currentMonth ? 'font-bold text-surface-700' : 'text-surface-400')}>
            {MONTHS[i].charAt(0)}
          </span>
        </div>
      ))}
    </div>
  );
};

// ─── Expense Row ───────────────────────────────────────────────────────────

const ExpenseRow = React.memo(({ expense, onEdit, onDelete }) => {
  const palette = COLOR_PALETTE[expense.categoryColor] || COLOR_PALETTE.slate;
  const dateStr = expense.expenseDate
    ? fmtDate(expense.expenseDate, { month: 'short', day: 'numeric' })
    : '—';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="list-card list-card--accent p-3 px-4 group cursor-pointer"
      onClick={() => onEdit(expense)}
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-surface-400 tabular-nums shrink-0 w-12">{dateStr}</span>
              {expense.type === 'credit' ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                  Credit
                </span>
              ) : expense.teamPaymentId ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200 shrink-0">
                  <Users className="w-2.5 h-2.5" /> Team
                </span>
              ) : expense.categoryName ? (
                <span className={cn(
                  'inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border shrink-0',
                  palette.bg, palette.text, palette.border,
                )}>
                  <span className={cn('w-1.5 h-1.5 rounded-full', palette.dot)} />
                  {expense.categoryName}
                </span>
              ) : null}
              <span className="text-sm font-medium text-surface-700 truncate">{expense.description}</span>
            </div>
            <span className={cn(
              'text-sm font-bold tabular-nums shrink-0',
              expense.type === 'credit' ? 'text-emerald-600' : 'text-surface-800',
            )}>
              {expense.type === 'credit' ? '+' : ''}{formatCurrency(expense.amount)}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-2 text-xs text-surface-400">
              {expense.vendorName && <span className="truncate">{expense.vendorName}</span>}
              {expense.projectTitle && (
                <span className="flex items-center gap-1 truncate">
                  <FolderKanban className="w-3 h-3" />
                  {expense.projectTitle}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
              <button onClick={() => onEdit(expense)} className="icon-button !p-1.5">
                <Edit2 className="w-3.5 h-3.5 text-blue-400" />
              </button>
              <button onClick={() => onDelete(expense)} className="icon-button !p-1.5">
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
});

// ─── Recurring Expense Card ───────────────────────────────────────────────

const RecurringExpenseCard = React.memo(({ item, onEdit, onToggle, onDelete }) => {
  const palette = COLOR_PALETTE[item.categoryColor] || COLOR_PALETTE.slate;
  const nextDueStr = item.nextDueDate
    ? fmtDate(item.nextDueDate, { month: 'short', day: 'numeric' })
    : '—';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('list-card list-card--accent p-3 px-4 group cursor-pointer', !item.isActive && 'opacity-50')}
      onClick={() => onEdit(item)}
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {item.categoryName && (
                <span className={cn(
                  'inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border shrink-0',
                  palette.bg, palette.text, palette.border,
                )}>
                  <span className={cn('w-1.5 h-1.5 rounded-full', palette.dot)} />
                  {item.categoryName}
                </span>
              )}
              <span className="text-sm font-medium text-surface-700 truncate">{item.description}</span>
            </div>
            <span className="text-sm font-bold tabular-nums text-surface-800 shrink-0">{formatCurrency(item.amount)}</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-2 text-xs text-surface-400">
              <span className="shrink-0">{FREQUENCY_LABELS[item.frequency] || item.frequency}</span>
              <span className="shrink-0">·</span>
              <span className="shrink-0">Next: {nextDueStr}</span>
              {item.vendorName && (
                <>
                  <span className="shrink-0">·</span>
                  <span className="truncate">{item.vendorName}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
              <button onClick={() => onToggle(item)} className="icon-button !p-1.5" title={item.isActive ? 'Pause' : 'Resume'}>
                {item.isActive
                  ? <Pause className="w-3.5 h-3.5 text-amber-400" />
                  : <Play className="w-3.5 h-3.5 text-emerald-400" />
                }
              </button>
              <button onClick={() => onEdit(item)} className="icon-button !p-1.5">
                <Edit2 className="w-3.5 h-3.5 text-blue-400" />
              </button>
              <button onClick={() => onDelete(item)} className="icon-button !p-1.5">
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
});

// ─── Expense Form Dialog ───────────────────────────────────────────────────

// ─── Main Component ────────────────────────────────────────────────────────

const ExpensesManager = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [sortBy, setSortBy] = useState('createdAt-desc');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [editingRecurringExpense, setEditingRecurringExpense] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteRecurringTarget, setDeleteRecurringTarget] = useState(null);

  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  const createRecurringExpense = useCreateRecurringExpense();
  const updateRecurringExpense = useUpdateRecurringExpense();
  const toggleRecurringExpense = useToggleRecurringExpense();
  const deleteRecurringExpense = useDeleteRecurringExpense();

  // Categories
  const { data: categoriesData } = useQuery({
    queryKey: queryKeys.expenseCategories.list(),
    queryFn: () => api.get('/expense-categories'),
  });
  const categories = categoriesData?.data || [];

  // Vendors
  const { data: vendorsData } = useQuery({
    queryKey: queryKeys.vendors.list(),
    queryFn: () => api.get('/vendors'),
  });
  const vendorsList = vendorsData?.data || [];

  // Stats
  const { data: stats } = useQuery({
    queryKey: queryKeys.expenses.stats(),
    queryFn: () => api.get('/expenses/stats'),
  });

  // Stat cards scroll-snap dot tracking — must be AFTER useQuery so stats is available
  const statScrollRef = useRef(null);
  const [activeStatIdx, setActiveStatIdx] = useState(0);
  const STAT_COUNT = 4;

  const checkActiveCard = useCallback(() => {
    const el = statScrollRef.current;
    if (!el || !el.children.length) return;
    const card = el.children[0];
    const cardWidth = card.offsetWidth + 12; // card width + gap
    const idx = Math.round(el.scrollLeft / cardWidth);
    setActiveStatIdx(Math.min(idx, STAT_COUNT - 1));
  }, []);

  useEffect(() => {
    const el = statScrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkActiveCard, { passive: true });
    return () => el.removeEventListener('scroll', checkActiveCard);
  }, [checkActiveCard, !!stats]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recurring expenses
  const { data: recurringData } = useQuery({
    queryKey: queryKeys.recurringExpenses.list(),
    queryFn: () => api.get('/recurring-expenses'),
  });
  const recurringList = recurringData?.data || [];

  // Expense list
  const {
    data: expensesData,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.expenses.list({ search: debouncedSearch, categoryId: filterCategoryId, sortBy }),
    queryFn: async ({ pageParam = 0 }) => {
      const [orderBy, dir] = sortBy.split('-');
      return api.get('/expenses', {
        search: debouncedSearch || undefined,
        page: pageParam,
        pageSize: PAGE_SIZE,
        categoryId: filterCategoryId || undefined,
        orderBy,
        asc: dir === 'asc' ? 'true' : 'false',
      });
    },
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, p) => sum + (p.data?.length || 0), 0);
      return totalFetched < (lastPage.count || 0) ? allPages.length : undefined;
    },
    initialPageParam: 0,
    staleTime: 2 * 60_000,
  });

  const expenses = expensesData?.pages.flatMap(p => p.data || []) ?? [];
  const totalCount = expensesData?.pages[0]?.count || 0;

  // Regular expense handlers
  const handleSave = useCallback(async (formData) => {
    try {
      if (editingExpense) {
        await updateExpense.mutateAsync({ id: editingExpense.id, ...formData });
      } else {
        await createExpense.mutateAsync(formData);
      }
      setIsFormOpen(false);
      setEditingExpense(null);
    } catch { /* handled by mutation */ }
  }, [editingExpense, createExpense, updateExpense]);

  const handleEdit = useCallback((expense) => {
    setEditingExpense(expense);
    setEditingRecurringExpense(null);
    setIsFormOpen(true);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteExpense.mutateAsync(deleteTarget.id);
    } catch { /* handled */ }
    setDeleteTarget(null);
  }, [deleteExpense, deleteTarget]);

  // Recurring expense handlers
  const handleSaveRecurring = useCallback(async (formData) => {
    try {
      if (editingRecurringExpense) {
        await updateRecurringExpense.mutateAsync({ id: editingRecurringExpense.id, ...formData });
      } else {
        await createRecurringExpense.mutateAsync(formData);
      }
      setIsFormOpen(false);
      setEditingRecurringExpense(null);
    } catch { /* handled by mutation */ }
  }, [editingRecurringExpense, createRecurringExpense, updateRecurringExpense]);

  const handleEditRecurring = useCallback((item) => {
    setEditingRecurringExpense(item);
    setEditingExpense(null);
    setIsFormOpen(true);
  }, []);

  const handleToggleRecurring = useCallback(async (item) => {
    try { await toggleRecurringExpense.mutateAsync(item.id); } catch { /* handled */ }
  }, [toggleRecurringExpense]);

  const handleDeleteRecurring = useCallback(async () => {
    if (!deleteRecurringTarget) return;
    try { await deleteRecurringExpense.mutateAsync(deleteRecurringTarget.id); } catch { /* handled */ }
    setDeleteRecurringTarget(null);
  }, [deleteRecurringExpense, deleteRecurringTarget]);

  const avgPerMonth = stats ? (stats.totalThisYear / Math.max(new Date().getMonth() + 1, 1)) : 0;
  const maxCatTotal = stats?.byCategory?.length ? Math.max(...stats.byCategory.map(c => c.total)) : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-100 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-surface-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Expenses</h1>
            <p className="text-surface-400 text-sm">Track your business expenses</p>
          </div>
        </div>
        <button onClick={() => { setEditingExpense(null); setEditingRecurringExpense(null); setIsFormOpen(true); }} className="action-btn">
          <Plus className="w-4 h-4 mr-2" /> Add
        </button>
      </div>

      {/* Dashboard */}
      {stats && (
        <div className="space-y-4">
          {/* Stat cards — snap carousel on mobile, grid on sm+ */}
          <div>
            <div
              ref={statScrollRef}
              className="flex gap-3 overflow-x-auto scrollbar-hide sm:grid sm:grid-cols-4 sm:overflow-visible"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              <StatCard label="Total" value={formatCurrency(stats.totalAllTime)} icon={Wallet} />
              <StatCard label="This Year" value={formatCurrency(stats.totalThisYear)} icon={CalendarIcon} />
              <StatCard label="This Month" value={formatCurrency(stats.totalThisMonth)} icon={DollarSign} />
              <StatCard label="Avg / Month" value={formatCurrency(avgPerMonth)} icon={TrendingDown} />
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

          {/* Charts row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* By Category */}
            {stats.byCategory?.length > 0 && (
              <div className="glass-card p-4">
                <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">By Category</h3>
                <div className="space-y-2.5">
                  {stats.byCategory.map((c, i) => (
                    <CategoryBar key={c.categoryId || i} name={c.name} color={c.color} total={c.total} maxTotal={maxCatTotal} />
                  ))}
                </div>
              </div>
            )}

            {/* Monthly Trend */}
            {stats.byMonth?.length > 0 && (
              <div className="glass-card p-4">
                <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">This Year Trend</h3>
                <MonthlyTrend byMonth={stats.byMonth} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active Subscriptions */}
      {recurringList.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 rounded-full bg-blue-400" />
            <h2 className="text-sm font-semibold text-surface-700">Active Subscriptions</h2>
            <span className="text-xs text-surface-400">({recurringList.filter(r => r.isActive).length} active)</span>
          </div>
          <AnimatePresence>
            {recurringList.map(r => (
              <RecurringExpenseCard
                key={r.id}
                item={r}
                onEdit={handleEditRecurring}
                onToggle={handleToggleRecurring}
                onDelete={setDeleteRecurringTarget}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="glass-input w-full pl-9 pr-8 text-sm"
            placeholder="Search expenses..."
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-surface-400" />
            </button>
          )}
        </div>
        <select
          value={filterCategoryId}
          onChange={e => setFilterCategoryId(e.target.value)}
          className="glass-input text-sm w-auto"
        >
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          className="glass-input text-sm w-auto"
        >
          <option value="expenseDate-desc">Date (Newest)</option>
          <option value="expenseDate-asc">Date (Oldest)</option>
          <option value="amount-desc">Amount (High→Low)</option>
          <option value="amount-asc">Amount (Low→High)</option>
          <option value="createdAt-desc">Added (Newest)</option>
          <option value="createdAt-asc">Added (Oldest)</option>
        </select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : expenses.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mx-auto mb-4">
            <Wallet className="w-8 h-8 text-surface-400" />
          </div>
          <h3 className="text-lg font-semibold text-surface-700 mb-1">No expenses yet</h3>
          <p className="text-surface-400 text-sm mb-4">Start tracking your business expenses.</p>
          <button onClick={() => { setEditingExpense(null); setEditingRecurringExpense(null); setIsFormOpen(true); }} className="action-btn">
            <Plus className="w-4 h-4 mr-2" /> Add Expense
          </button>
        </div>
      ) : (
        <>
          <p className="text-xs text-surface-400">{totalCount} expense{totalCount !== 1 ? 's' : ''}</p>
          <div className="space-y-2">
            <AnimatePresence>
              {expenses.map(e => (
                <ExpenseRow key={e.id} expense={e} onEdit={handleEdit} onDelete={setDeleteTarget} />
              ))}
            </AnimatePresence>
          </div>
          {hasNextPage && (
            <div className="flex justify-center pt-4">
              <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage} className="action-btn action-btn--secondary text-sm">
                {isFetchingNextPage ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Load more
              </button>
            </div>
          )}
        </>
      )}

      {/* Form Dialog */}
      <ExpenseFormDialog
        expense={editingExpense}
        recurringExpense={editingRecurringExpense}
        open={isFormOpen}
        onOpenChange={(open) => {
          if (!open) { setEditingExpense(null); setEditingRecurringExpense(null); }
          setIsFormOpen(open);
        }}
        categories={categories}
        vendors={vendorsList}
        onSave={handleSave}
        onSaveRecurring={handleSaveRecurring}
        isPending={
          createExpense.isPending || updateExpense.isPending ||
          createRecurringExpense.isPending || updateRecurringExpense.isPending
        }
        isTeamPaymentLinked={!!editingExpense?.teamPaymentId}
      />

      {/* Delete Expense Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.teamPaymentId ? 'team payment expense' : 'expense'}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.teamPaymentId
                ? `This will also delete the linked team payment of ${formatCurrency(deleteTarget?.amount)}. This action cannot be undone.`
                : `This will permanently delete "${deleteTarget?.description}". This action cannot be undone.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600 text-[#C8C6C2]">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Recurring Expense Confirmation */}
      <AlertDialog open={!!deleteRecurringTarget} onOpenChange={(open) => { if (!open) setDeleteRecurringTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete recurring expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the subscription "{deleteRecurringTarget?.description}". Previously generated expenses will remain. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRecurring} className="bg-red-500 hover:bg-red-600 text-[#C8C6C2]">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ExpensesManager;
