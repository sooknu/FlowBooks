# Expense Credits Design

## Problem
Need to track income/credits (e.g. selling equipment) in the expense system so that money received can offset expenses.

## Approach
Add an `expense_type` enum (`expense` | `credit`) column to the existing `expenses` table. Credits are expenses that subtract from totals.

## Database
- New enum: `expenseTypeEnum` = `('expense', 'credit')`
- New column: `expenses.type` — default `'expense'`, not null
- No migration needed for existing data (all rows default to `'expense'`)

## Stats
All `SUM(amount)` → `SUM(CASE WHEN type='credit' THEN -amount ELSE amount END)` in:
- totalThisYear, totalThisMonth
- byCategory (net per category)
- byMonth (net per month)

## UI
- Expense list: green "Credit" badge on credit rows, amount in green with `+` prefix
- ExpenseFormDialog: toggle at top "This is income / credit"
  - Same form fields (categories, project, vendor, date, notes)
  - Credits cannot be recurring
- Project Expenses tab: same net calculation, summary cards show net amounts

## Permissions
No changes — existing `manage_expenses` permission covers credits.
