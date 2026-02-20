# Reports Tab Design

## Goal
Add a comprehensive Reports page with a card grid layout showing financial health, client insights, and tax-ready summaries. Each card displays a headline metric with a spark visualization, expandable to a full detail view.

## Architecture
- Single `/reports` route with a `ReportsManager` component
- Global year/date-range selector at the top controls all cards
- One new backend endpoint `GET /api/reports` returns all aggregated data for the selected period
- Cards are grouped into three labeled sections: Financial, Clients, Tax & Summary
- Each card click expands inline to show a detail table/chart
- Permission-gated behind `view_financial_summary`

## Page Layout

```
[ Year: 2025 | 2026 | Custom ▾ ]

── Financial ──────────────────────────
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Profit &    │ │  Revenue     │ │  Cash Flow   │ │  Revenue by  │
│  Loss        │ │  Trend       │ │              │ │  Project Type│
│  $XX,XXX     │ │  $XX,XXX     │ │  $XX,XXX     │ │  Weddings    │
│  ▃▅▇▅▆▃▅    │ │  ╱‾‾╲╱‾     │ │  ▃▅▇▅▆▃▅    │ │  ████░░░     │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘

── Clients ────────────────────────────
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Top Clients │ │  Client      │ │  Repeat      │
│              │ │  Profit      │ │  Client Rate │
│  Client Name │ │  Client Name │ │  72%         │
│  ████░░░░    │ │  ████░░░░    │ │  ◕           │
└──────────────┘ └──────────────┘ └──────────────┘

── Tax & Summary ──────────────────────
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Income      │ │  Expenses by │ │  Outstanding │
│  Summary     │ │  Category    │ │  Balances    │
│  $XX,XXX     │ │  $XX,XXX     │ │  $XX,XXX     │
│  monthly tbl │ │  ●●●● dots   │ │  X invoices  │
└──────────────┘ └──────────────┘ └──────────────┘
```

## Report Cards Detail

### Financial Section

#### 1. Profit & Loss
- **Headline:** Net profit (revenue - expenses - salary paid) for period
- **Spark:** Mini bar chart — revenue vs expenses per month
- **Detail view:** Month-by-month table with columns: Month, Revenue, Expenses, Team Costs, Salary, Net Profit. Totals row at bottom.
- **Data sources:** `invoices.paidAmount` (revenue), `expenses` where type='expense', `teamSalary` where type='paid'

#### 2. Revenue Trend
- **Headline:** Total revenue received for period
- **Spark:** Trend line (monthly revenue)
- **Detail view:** Monthly revenue breakdown table. Shows revenue from invoices (paidAmount) and project credits.
- **Data sources:** `invoices.paidAmount` grouped by month, `expenses` where type='credit' grouped by month

#### 3. Cash Flow
- **Headline:** Net cash flow (money in minus money out)
- **Spark:** Mini area chart (inflows vs outflows)
- **Detail view:** Monthly table — Money In (invoice payments received), Money Out (expenses + team payments paid + salary paid), Net, Running Balance
- **Data sources:** `payments.amount` by month (money in), `expenses` + `teamPayments` where status='paid' + `teamSalary` where type='paid' (money out)

#### 4. Revenue by Project Type
- **Headline:** Top-earning project type name + amount
- **Spark:** Horizontal mini bars colored by project type
- **Detail view:** Ranked table — Project Type, Project Count, Total Revenue, Avg Revenue Per Project
- **Data sources:** `projects` joined with `projectTypes`, revenue via credits or invoices per project

### Clients Section

#### 5. Top Clients by Revenue
- **Headline:** #1 client name + total revenue
- **Spark:** Horizontal bar ranking (top 5)
- **Detail view:** Full ranked list — Client Name, Total Invoiced, Total Paid, Project Count, Avg Project Value
- **Data sources:** `invoices` grouped by clientId, joined with `clients`

#### 6. Client Profitability
- **Headline:** Most profitable client name + profit amount
- **Spark:** Profit bars (top 5)
- **Detail view:** Ranked list — Client, Revenue, Linked Expenses, Profit, Margin %
- **Data sources:** Revenue from invoices/credits per client, expenses linked to projects belonging to that client

#### 7. Repeat Client Rate
- **Headline:** X% of clients have multiple projects
- **Spark:** Donut/ring showing repeat vs one-time
- **Detail view:** Two lists — Repeat clients (with project count), One-time clients. Summary stats.
- **Data sources:** `projects` grouped by clientId, count > 1 = repeat

### Tax & Summary Section

#### 8. Income Summary
- **Headline:** Total income received in period
- **Detail view:** Month-by-month income table, total at bottom. Clean format for accountant/tax filing.
- **Data sources:** `invoices.paidAmount` by month + `expenses` where type='credit' by month

#### 9. Expense Summary by Category
- **Headline:** Total expenses in period
- **Spark:** Category color dots with amounts
- **Detail view:** Category-by-category table with totals, sorted by amount. Each category shows its color.
- **Data sources:** `expenses` where type='expense' grouped by categoryId, joined with expenseCategories

#### 10. Outstanding Balances
- **Headline:** Total money owed to you
- **Spark:** Count of unpaid items
- **Detail view:** Two sub-lists:
  - Unpaid/partial invoices (client, invoice #, total, paid, remaining, days outstanding)
  - Project balances (project title, project price, received, remaining)
- **Data sources:** `invoices` where status != 'paid', `projects` where projectPrice - credits > 0

## Backend API

### `GET /api/reports?year=2026` (or `&startDate=&endDate=`)

Single endpoint returns all report data for the selected period. Permission: `view_financial_summary`.

Response shape:
```json
{
  "period": { "start": "2026-01-01", "end": "2026-12-31" },
  "profitLoss": {
    "totalRevenue": 0, "totalExpenses": 0, "totalTeamCosts": 0, "totalSalary": 0, "netProfit": 0,
    "byMonth": [{ "month": 1, "revenue": 0, "expenses": 0, "teamCosts": 0, "salary": 0 }]
  },
  "revenueTrend": {
    "total": 0,
    "byMonth": [{ "month": 1, "invoiceRevenue": 0, "creditRevenue": 0 }]
  },
  "cashFlow": {
    "totalIn": 0, "totalOut": 0, "net": 0,
    "byMonth": [{ "month": 1, "moneyIn": 0, "moneyOut": 0 }]
  },
  "revenueByType": [{ "typeId": "", "typeLabel": "", "color": "", "revenue": 0, "count": 0 }],
  "topClients": [{ "clientId": "", "name": "", "totalInvoiced": 0, "totalPaid": 0, "projectCount": 0 }],
  "clientProfitability": [{ "clientId": "", "name": "", "revenue": 0, "expenses": 0, "profit": 0 }],
  "repeatClients": { "total": 0, "repeat": 0, "rate": 0, "repeatList": [], "oneTimeList": [] },
  "incomeSummary": { "total": 0, "byMonth": [{ "month": 1, "amount": 0 }] },
  "expensesByCategory": [{ "categoryId": "", "name": "", "color": "", "total": 0 }],
  "outstanding": {
    "total": 0,
    "invoices": [{ "id": "", "invoiceNumber": "", "clientName": "", "total": 0, "paid": 0, "remaining": 0, "daysOutstanding": 0 }],
    "projects": [{ "id": "", "title": "", "price": 0, "received": 0, "remaining": 0 }]
  }
}
```

## Frontend Components

- `ReportsManager.jsx` — main page component, year picker, fetches `/api/reports`, renders grid
- Report cards rendered inline (no separate component files) — each card is a `<ReportCard>` sub-component within the file
- Detail views expand inline below the card row when clicked (accordion-style with AnimatePresence)
- Mini spark charts rendered with plain SVG (no chart library needed — just polylines/rects)
- Mobile: cards stack single column. Desktop: 2-4 column grid.

## Styling
- Cards use existing `.glass-card` / `.flat-card` patterns
- Section headers use existing heading styles
- Spark charts use CSS variables for colors matching the app theme
- BEM class naming: `.reports__grid`, `.report-card`, `.report-card__headline`, `.report-card__spark`, `.report-card__detail`

## Permissions
- Entire reports page gated behind `view_financial_summary` permission
- If user lacks permission, show a "no access" message (same pattern as other gated views)

## Route
- Replace existing `ComingSoon` at `/reports` with the new `ReportsManager` component
- Lazy-loaded via `React.lazy` in `App.jsx`
