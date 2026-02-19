# Project Client Balance Design

## Problem

Past projects imported without invoices have no way to track what a client owes. Open Balance currently derives from `totalInvoiced - totalPaid`, which is $0 when no invoices exist.

## Solution

Add a `projectPrice` field to the projects table. When set, Open Balance = `projectPrice - totalCredits`. Credits (already supported as `type: 'credit'` in the expenses system) serve as client payments against the balance.

## Schema Change

Add to `projects` table:
- `projectPrice` (doublePrecision, nullable, default null)

## Backend

- Accept `projectPrice` in existing `POST /api/projects` and `PUT /api/projects/:id` routes
- No new endpoints — credits are recorded through existing `/api/expenses`

## Frontend: Overview Tab

Updated financial card math:
- **If `projectPrice` is set:**
  - Open Balance = `projectPrice - totalCredits`
  - Total Income = `projectPrice`
- **If `projectPrice` is null (default):**
  - Open Balance = `totalInvoiced - totalPaid` (unchanged)
  - Total Income = `totalInvoiced + totalCredits` (unchanged)

## Frontend: Project Edit Form

Add "Project Price" field to `ProjectFormDialog` — numeric input, optional.

## No Changes Needed

- Expenses tab: credits already work as client payments
- Dashboard stats: aggregates from invoices, unaffected
- Team tab: uses `teamCostPaid`, unaffected
