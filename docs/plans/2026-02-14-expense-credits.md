# Expense Credits Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `type` column to expenses so entries can be either an expense (outflow) or a credit (inflow), with credits subtracting from totals.

**Architecture:** Add `expenseTypeEnum` pgEnum and a `type` column (default `'expense'`) to the `expenses` table. Update stats queries to use net SUM. Update form dialog with a toggle. Update list displays with credit badge/color.

**Tech Stack:** Drizzle ORM (PostgreSQL), React, TanStack Query

---

### Task 1: Schema — Add expense type enum and column

**Files:**
- Modify: `server/db/schema.ts:14` (add enum after line 14)
- Modify: `server/db/schema.ts:551` (add `type` column after `amount`)

**Step 1: Add enum and column**

After the existing enums (line 14), add:
```typescript
export const expenseTypeEnum = pgEnum('ExpenseType', ['expense', 'credit']);
```

In the `expenses` table definition, after the `amount` line (line 551), add:
```typescript
type: expenseTypeEnum('type').notNull().default('expense'),
```

**Step 2: Push schema to database**

Run: `npm run db:push`
Expected: Schema synced, existing rows get `type = 'expense'` default.

---

### Task 2: Backend — Update routes to handle type

**Files:**
- Modify: `server/routes/expenses.ts:11-21` (mapBody function)
- Modify: `server/routes/expenses.ts:60-73` (GET / select)
- Modify: `server/routes/expenses.ts:89-136` (GET /stats)

**Step 1: Update `mapBody` to include `type`**

```typescript
function mapBody(body: any) {
  return {
    categoryId: body.categoryId || null,
    projectId: body.projectId || null,
    description: body.description,
    amount: parseFloat(body.amount),
    type: body.type === 'credit' ? 'credit' as const : 'expense' as const,
    expenseDate: body.expenseDate ? new Date(body.expenseDate) : new Date(),
    vendor: body.vendor || null,
    notes: body.notes || null,
  };
}
```

**Step 2: Add `type` to GET / select fields**

In the `db.select({...})` block (line 60), add after `amount`:
```typescript
type: expenses.type,
```

**Step 3: Update GET /stats to use net SUM**

Replace all `sum(expenses.amount)` with a net sum expression. Define a helper at the top of the route handler:

```typescript
const netAmount = sql<number>`SUM(CASE WHEN ${expenses.type} = 'credit' THEN -${expenses.amount} ELSE ${expenses.amount} END)`;
```

Then replace each `sum(expenses.amount)` with `netAmount` in:
- `totalThisYear` query
- `totalThisMonth` query
- `byCategory` query (both in select and orderBy)
- `byMonth` query

---

### Task 3: Frontend — Update ExpenseFormDialog with credit toggle

**Files:**
- Modify: `src/components/ExpenseFormDialog.jsx`

**Step 1: Add `type` to form state**

In the initial `useState` (line 22), add `type: 'expense'` to the form object.

**Step 2: Populate `type` on edit**

In the `useEffect` (line 44):
- When loading `expense`: set `type: expense.type || 'expense'`
- When loading `recurringExpense`: set `type: 'expense'` (recurring can't be credits)
- When creating new: set `type: 'expense'`

**Step 3: Include `type` in submit**

In `handleSubmit`, add `type: form.type` to the `base` object (line 102).

**Step 4: Add credit toggle UI**

After the team payment info banner (line 153) and before the Date field, add a toggle — only shown when NOT `isTeamPaymentLinked` and NOT `isEditingRecurring`:

```jsx
{!isTeamPaymentLinked && !isEditingRecurring && (
  <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-surface-50 border border-surface-200/60">
    <div className="flex items-center gap-2">
      <ArrowDownLeft className="w-4 h-4 text-surface-400" />
      <div>
        <label className="text-xs font-medium text-surface-700">Income / Credit</label>
        <p className="text-[10px] text-surface-400">Money received (e.g. sold equipment)</p>
      </div>
    </div>
    <label className="relative inline-flex items-center cursor-pointer">
      <input
        type="checkbox"
        checked={form.type === 'credit'}
        onChange={e => setForm({ ...form, type: e.target.checked ? 'credit' : 'expense' })}
        className="sr-only peer"
      />
      <div className="w-9 h-5 bg-surface-200 rounded-full peer peer-checked:bg-emerald-400 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
    </label>
  </div>
)}
```

Import `ArrowDownLeft` from lucide-react.

**Step 5: Hide recurring toggle when credit is selected**

Wrap the existing recurring toggle condition to also check `form.type !== 'credit'`:
```jsx
{!expense && !isTeamPaymentLinked && form.type !== 'credit' && (
```

**Step 6: Update dialog title and submit label**

Adjust `dialogTitle` to show "Add Credit" when creating a credit. Adjust `submitLabel` to show "Add Credit" instead of "Add Expense" when type is credit.

---

### Task 4: Frontend — Update ExpensesManager list display

**Files:**
- Modify: `src/components/ExpensesManager.jsx:100-158` (ExpenseRow)
- Modify: `src/components/ExpensesManager.jsx:133` (amount display)

**Step 1: Add Credit badge to ExpenseRow**

In the badge area (after the team payment badge check, line 118), add a credit badge condition:

```jsx
{expense.type === 'credit' ? (
  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
    Credit
  </span>
) : expense.teamPaymentId ? (
  // existing team badge...
```

**Step 2: Style credit amounts in green with + prefix**

Replace the amount display (line 133):
```jsx
<span className={cn(
  'text-sm font-bold tabular-nums shrink-0',
  expense.type === 'credit' ? 'text-emerald-600' : 'text-surface-800',
)}>
  {expense.type === 'credit' ? '+' : ''}{formatCurrency(expense.amount)}
</span>
```

---

### Task 5: Frontend — Update ProjectDetail ExpensesTab

**Files:**
- Modify: `src/components/ProjectDetail.jsx:902-905` (summary calculations)
- Modify: `src/components/ProjectDetail.jsx:~983-1010` (expense row amount display)

**Step 1: Update summary calculations to use net amounts**

```javascript
const totalExpenses = expenses.reduce((sum, e) => {
  const amt = e.amount || 0;
  return sum + (e.type === 'credit' ? -amt : amt);
}, 0);
const teamPaymentTotal = expenses.filter(e => e.teamPaymentId).reduce((s, e) => s + (e.amount || 0), 0);
const otherTotal = totalExpenses - teamPaymentTotal;
```

**Step 2: Add credit badge and green amount to project expense rows**

Same pattern as Task 4 — credit badge + green `+$amount` display in the project expense list rows.

---

### Task 6: Build and test

**Step 1: Build**
Run: `cd ~/madridphotography && npm run build`

**Step 2: Restart**
Run: `pm2 restart madrid-quotes`

**Step 3: Verify**
- Create a regular expense — should work as before
- Create a credit (toggle on) — should show green badge, green +$amount
- Check stats dashboard — totals should be net (expenses minus credits)
- Check project expenses tab — summary cards should reflect net amounts
