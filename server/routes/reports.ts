import { db } from '../db';
import { invoices, expenses, expenseCategories, projects, projectTypes, clients, teamPayments, teamSalary } from '../db/schema';
import { eq, and, gte, lt, sql, ne, desc, asc as ascFn, count, isNull } from 'drizzle-orm';
import { requirePermission } from '../lib/permissions';

export default async function reportsRoutes(fastify: any) {
  const guard = requirePermission('view_financial_summary');

  // GET / — all report data for a period
  fastify.get('/', { preHandler: [guard] }, async (request: any) => {
    const { year, startDate, endDate } = request.query;

    let periodStart: Date;
    let periodEnd: Date;

    if (startDate && endDate) {
      periodStart = new Date(startDate);
      periodEnd = new Date(endDate);
    } else {
      const y = parseInt(year) || new Date().getFullYear();
      periodStart = new Date(y, 0, 1);
      periodEnd = new Date(y + 1, 0, 1);
    }

    const startIso = periodStart.toISOString();
    const endIso = periodEnd.toISOString();
    const inPeriod = (dateCol: any) => and(gte(dateCol, periodStart), lt(dateCol, periodEnd));
    const isExpense = eq(expenses.type, sql`'expense'`);
    const isCredit = eq(expenses.type, sql`'credit'`);
    const notTeamPayment = isNull(expenses.teamPaymentId);

    // ── Profit & Loss ─────────────────────────────────
    const plByMonth = await db.select({
      month: sql<number>`EXTRACT(MONTH FROM ${invoices.createdAt})::int`,
      revenue: sql<number>`COALESCE(SUM(${invoices.paidAmount}), 0)`,
    })
      .from(invoices)
      .where(inPeriod(invoices.createdAt))
      .groupBy(sql`EXTRACT(MONTH FROM ${invoices.createdAt})`);

    const expByMonth = await db.select({
      month: sql<number>`EXTRACT(MONTH FROM ${expenses.expenseDate})::int`,
      expenses: sql<number>`COALESCE(SUM(${expenses.amount}), 0)`,
    })
      .from(expenses)
      .where(and(isExpense, inPeriod(expenses.expenseDate), notTeamPayment))
      .groupBy(sql`EXTRACT(MONTH FROM ${expenses.expenseDate})`);

    const salaryByMonth = await db.select({
      month: sql<number>`EXTRACT(MONTH FROM ${teamSalary.entryDate})::int`,
      salary: sql<number>`COALESCE(SUM(${teamSalary.amount}), 0)`,
    })
      .from(teamSalary)
      .where(and(eq(teamSalary.type, sql`'paid'`), inPeriod(teamSalary.entryDate)))
      .groupBy(sql`EXTRACT(MONTH FROM ${teamSalary.entryDate})`);

    const teamCostsByMonth = await db.select({
      month: sql<number>`EXTRACT(MONTH FROM ${teamPayments.paymentDate})::int`,
      teamCosts: sql<number>`COALESCE(SUM(${teamPayments.amount}), 0)`,
    })
      .from(teamPayments)
      .where(and(eq(teamPayments.status, sql`'paid'`), inPeriod(teamPayments.paymentDate)))
      .groupBy(sql`EXTRACT(MONTH FROM ${teamPayments.paymentDate})`);

    // Merge monthly P&L
    const monthMap: Record<number, any> = {};
    for (let m = 1; m <= 12; m++) monthMap[m] = { month: m, revenue: 0, expenses: 0, teamCosts: 0, salary: 0 };
    for (const r of plByMonth) monthMap[r.month].revenue = parseFloat(r.revenue as any) || 0;
    for (const r of expByMonth) monthMap[r.month].expenses = parseFloat(r.expenses as any) || 0;
    for (const r of salaryByMonth) monthMap[r.month].salary = parseFloat(r.salary as any) || 0;
    for (const r of teamCostsByMonth) monthMap[r.month].teamCosts = parseFloat(r.teamCosts as any) || 0;

    const plMonths = Object.values(monthMap).sort((a: any, b: any) => a.month - b.month);
    const totalRevenue = plMonths.reduce((s: number, m: any) => s + m.revenue, 0);
    const totalExpenses = plMonths.reduce((s: number, m: any) => s + m.expenses, 0);
    const totalTeamCosts = plMonths.reduce((s: number, m: any) => s + m.teamCosts, 0);
    const totalSalary = plMonths.reduce((s: number, m: any) => s + m.salary, 0);

    // ── Revenue Trend (invoice revenue + credits) ─────
    const creditByMonth = await db.select({
      month: sql<number>`EXTRACT(MONTH FROM ${expenses.expenseDate})::int`,
      credits: sql<number>`COALESCE(SUM(${expenses.amount}), 0)`,
    })
      .from(expenses)
      .where(and(isCredit, inPeriod(expenses.expenseDate)))
      .groupBy(sql`EXTRACT(MONTH FROM ${expenses.expenseDate})`);

    const revMonths = plMonths.map((m: any) => {
      const credit = creditByMonth.find((c: any) => c.month === m.month);
      return { month: m.month, invoiceRevenue: m.revenue, creditRevenue: parseFloat(credit?.credits as any) || 0 };
    });
    const totalCredits = revMonths.reduce((s: number, m: any) => s + m.creditRevenue, 0);

    // ── Cash Flow ─────────────────────────────────────
    // Money in = credit expenses (revenue received for projects)
    // Money out = business expenses + team payments + salary
    const cfMonths = plMonths.map((m: any) => {
      const credit = creditByMonth.find((c: any) => c.month === m.month);
      const moneyIn = (parseFloat(credit?.credits as any) || 0) + m.revenue;
      const moneyOut = m.expenses + m.teamCosts + m.salary;
      return { month: m.month, moneyIn, moneyOut };
    });
    const totalIn = cfMonths.reduce((s: number, m: any) => s + m.moneyIn, 0);
    const totalOut = cfMonths.reduce((s: number, m: any) => s + m.moneyOut, 0);

    // ── Revenue by Project Type ───────────────────────
    const revenueByType = await db.execute(sql`
      SELECT
        p.project_type_id AS "typeId",
        pt.label AS "typeLabel",
        pt.color AS "typeColor",
        COALESCE(SUM(COALESCE(p.project_price, 0)), 0)::float AS revenue,
        COUNT(*)::int AS count
      FROM projects p
      LEFT JOIN project_types pt ON p.project_type_id = pt.id
      WHERE p.created_at >= ${startIso}::timestamptz
        AND p.created_at < ${endIso}::timestamptz
        AND p.status != 'archived'
      GROUP BY p.project_type_id, pt.label, pt.color
      ORDER BY revenue DESC
    `);

    // ── Top Clients ───────────────────────────────────
    const topClients = await db.select({
      clientId: invoices.clientId,
      firstName: clients.firstName,
      lastName: clients.lastName,
      company: clients.company,
      totalInvoiced: sql<number>`COALESCE(SUM(${invoices.total}), 0)`,
      totalPaid: sql<number>`COALESCE(SUM(${invoices.paidAmount}), 0)`,
      projectCount: sql<number>`COUNT(DISTINCT ${invoices.id})`,
    })
      .from(invoices)
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .where(and(inPeriod(invoices.createdAt), sql`${invoices.clientId} IS NOT NULL`))
      .groupBy(invoices.clientId, clients.firstName, clients.lastName, clients.company)
      .orderBy(desc(sql`COALESCE(SUM(${invoices.paidAmount}), 0)`))
      .limit(20);

    // ── Client Profitability ──────────────────────────
    // Revenue per client minus expenses linked to their projects
    const clientProfit = await db.execute(sql`
      WITH client_rev AS (
        SELECT i.client_id, COALESCE(SUM(i.paid_amount), 0) AS revenue
        FROM invoices i
        WHERE i.created_at >= ${startIso}::timestamptz AND i.created_at < ${endIso}::timestamptz
          AND i.client_id IS NOT NULL
        GROUP BY i.client_id
      ),
      client_exp AS (
        SELECT p.client_id, COALESCE(SUM(e.amount), 0) AS expenses
        FROM expenses e
        JOIN projects p ON e.project_id = p.id
        WHERE e.expense_date >= ${startIso}::timestamptz AND e.expense_date < ${endIso}::timestamptz
          AND e.type = 'expense'
          AND p.client_id IS NOT NULL
        GROUP BY p.client_id
      )
      SELECT
        cr.client_id AS "clientId",
        c.first_name AS "firstName", c.last_name AS "lastName", c.company,
        cr.revenue::float,
        COALESCE(ce.expenses, 0)::float AS expenses,
        (cr.revenue - COALESCE(ce.expenses, 0))::float AS profit
      FROM client_rev cr
      LEFT JOIN client_exp ce ON cr.client_id = ce.client_id
      LEFT JOIN clients c ON cr.client_id = c.id
      ORDER BY profit DESC
      LIMIT 20
    `);

    // ── Repeat Client Rate ────────────────────────────
    const clientProjectCounts = await db.select({
      clientId: projects.clientId,
      firstName: clients.firstName,
      lastName: clients.lastName,
      company: clients.company,
      projectCount: count(),
    })
      .from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(and(
        sql`${projects.clientId} IS NOT NULL`,
        ne(projects.status, sql`'archived'`),
      ))
      .groupBy(projects.clientId, clients.firstName, clients.lastName, clients.company);

    const totalClients = clientProjectCounts.length;
    const repeatClientsList = clientProjectCounts.filter((c: any) => parseInt(c.projectCount) > 1);
    const oneTimeList = clientProjectCounts.filter((c: any) => parseInt(c.projectCount) <= 1);
    const repeatRate = totalClients > 0 ? Math.round((repeatClientsList.length / totalClients) * 100) : 0;

    // ── Income Summary ────────────────────────────────
    // Already have revMonths from revenue trend
    const totalIncome = totalRevenue + totalCredits;

    // ── Expense Summary by Category ───────────────────
    const expensesByCat = await db.select({
      categoryId: expenses.categoryId,
      name: expenseCategories.name,
      color: expenseCategories.color,
      total: sql<number>`COALESCE(SUM(${expenses.amount}), 0)`,
    })
      .from(expenses)
      .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
      .where(and(isExpense, inPeriod(expenses.expenseDate)))
      .groupBy(expenses.categoryId, expenseCategories.name, expenseCategories.color)
      .orderBy(desc(sql`COALESCE(SUM(${expenses.amount}), 0)`));

    // ── Outstanding Balances ──────────────────────────
    const unpaidInvoices = await db.select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      clientId: invoices.clientId,
      firstName: clients.firstName,
      lastName: clients.lastName,
      company: clients.company,
      total: invoices.total,
      paidAmount: invoices.paidAmount,
      createdAt: invoices.createdAt,
    })
      .from(invoices)
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .where(ne(invoices.status, sql`'paid'`))
      .orderBy(ascFn(invoices.createdAt));

    const projectBalances = await db.execute(sql`
      SELECT
        p.id, p.title, p.project_price AS "projectPrice",
        COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.project_id = p.id AND e.type = 'credit'), 0)::float AS received,
        (p.project_price - COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.project_id = p.id AND e.type = 'credit'), 0))::float AS remaining
      FROM projects p
      WHERE p.project_price IS NOT NULL AND p.project_price > 0
        AND p.status != 'archived'
        AND (p.project_price - COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.project_id = p.id AND e.type = 'credit'), 0)) > 0
      ORDER BY remaining DESC
    `);

    const fmtClient = (r: any) => r.company || [r.firstName, r.lastName].filter(Boolean).join(' ') || 'Unknown';

    const outstandingInvoiceTotal = unpaidInvoices.reduce((s, i: any) => s + (parseFloat(i.total) || 0) - (parseFloat(i.paidAmount) || 0), 0);
    const outstandingProjectTotal = (projectBalances.rows || projectBalances).reduce((s: number, p: any) => s + (parseFloat(p.remaining) || 0), 0);

    return {
      period: { start: periodStart.toISOString(), end: periodEnd.toISOString() },
      profitLoss: {
        totalRevenue: totalIncome,
        totalExpenses,
        totalTeamCosts,
        totalSalary,
        netProfit: totalIncome - totalExpenses - totalTeamCosts - totalSalary,
        byMonth: plMonths.map((m: any) => {
          const credit = creditByMonth.find((c: any) => c.month === m.month);
          return { ...m, revenue: m.revenue + (parseFloat(credit?.credits as any) || 0) };
        }),
      },
      revenueTrend: {
        total: totalRevenue,
        totalWithCredits: totalIncome,
        byMonth: revMonths,
      },
      cashFlow: {
        totalIn,
        totalOut,
        net: totalIn - totalOut,
        byMonth: cfMonths,
      },
      revenueByType: ((revenueByType.rows || revenueByType) as any[]).map((r: any) => ({
        typeId: r.typeId,
        typeLabel: r.typeLabel || 'Uncategorized',
        color: r.typeColor || null,
        revenue: parseFloat(r.revenue) || 0,
        count: parseInt(r.count) || 0,
      })),
      topClients: (topClients as any[]).map(r => ({
        clientId: r.clientId,
        name: fmtClient(r),
        totalInvoiced: parseFloat(r.totalInvoiced as any) || 0,
        totalPaid: parseFloat(r.totalPaid as any) || 0,
        projectCount: parseInt(r.projectCount as any) || 0,
      })),
      clientProfitability: ((clientProfit.rows || clientProfit) as any[]).map((r: any) => ({
        clientId: r.clientId,
        name: fmtClient(r),
        revenue: parseFloat(r.revenue) || 0,
        expenses: parseFloat(r.expenses) || 0,
        profit: parseFloat(r.profit) || 0,
      })),
      repeatClients: {
        total: totalClients,
        repeat: repeatClientsList.length,
        rate: repeatRate,
        repeatList: repeatClientsList.map((c: any) => ({ name: fmtClient(c), projectCount: parseInt(c.projectCount) })),
        oneTimeList: oneTimeList.map((c: any) => ({ name: fmtClient(c) })),
      },
      incomeSummary: {
        total: totalIncome,
        byMonth: revMonths.map(m => ({ month: m.month, amount: m.invoiceRevenue + m.creditRevenue })),
      },
      expensesByCategory: (expensesByCat as any[]).map(r => ({
        categoryId: r.categoryId,
        name: r.name || 'Uncategorized',
        color: r.color || '#94a3b8',
        total: parseFloat(r.total as any) || 0,
      })),
      outstanding: {
        total: outstandingInvoiceTotal + outstandingProjectTotal,
        invoices: unpaidInvoices.map((i: any) => ({
          id: i.id,
          invoiceNumber: i.invoiceNumber,
          clientName: fmtClient(i),
          total: parseFloat(i.total) || 0,
          paid: parseFloat(i.paidAmount) || 0,
          remaining: (parseFloat(i.total) || 0) - (parseFloat(i.paidAmount) || 0),
          daysOutstanding: Math.floor((Date.now() - new Date(i.createdAt).getTime()) / 86400000),
        })),
        projects: ((projectBalances.rows || projectBalances) as any[]).map((p: any) => ({
          id: p.id,
          title: p.title,
          price: parseFloat(p.projectPrice) || 0,
          received: parseFloat(p.received) || 0,
          remaining: parseFloat(p.remaining) || 0,
        })),
      },
    };
  });
}
