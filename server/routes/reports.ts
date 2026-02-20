import { db } from '../db';
import { invoices, expenses, expenseCategories, projects, teamPayments, teamSalary, teamMembers } from '../db/schema';
import { eq, and, gte, lt, sql, desc, count, isNull } from 'drizzle-orm';
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

    // ── Team Payment Breakdown ──────────────────────────
    const tpPaid = eq(teamPayments.status, sql`'paid'`);

    const tpByMember = await db.select({
      name: teamMembers.name,
      role: teamMembers.role,
      totalPaid: sql<number>`COALESCE(SUM(${teamPayments.amount}), 0)`,
      jobCount: count(),
    })
      .from(teamPayments)
      .innerJoin(teamMembers, eq(teamPayments.teamMemberId, teamMembers.id))
      .where(and(tpPaid, inPeriod(teamPayments.paymentDate)))
      .groupBy(teamMembers.name, teamMembers.role)
      .orderBy(desc(sql`COALESCE(SUM(${teamPayments.amount}), 0)`));

    const tpByMonth = await db.select({
      month: sql<number>`EXTRACT(MONTH FROM ${teamPayments.paymentDate})::int`,
      total: sql<number>`COALESCE(SUM(${teamPayments.amount}), 0)`,
    })
      .from(teamPayments)
      .where(and(tpPaid, inPeriod(teamPayments.paymentDate)))
      .groupBy(sql`EXTRACT(MONTH FROM ${teamPayments.paymentDate})`);

    const tpByMethod = await db.select({
      method: teamPayments.paymentMethod,
      total: sql<number>`COALESCE(SUM(${teamPayments.amount}), 0)`,
    })
      .from(teamPayments)
      .where(and(tpPaid, inPeriod(teamPayments.paymentDate)))
      .groupBy(teamPayments.paymentMethod)
      .orderBy(desc(sql`COALESCE(SUM(${teamPayments.amount}), 0)`));

    const tpTotal = tpByMember.reduce((s: number, m: any) => s + (parseFloat(m.totalPaid as any) || 0), 0);
    const tpMonthMap: Record<number, number> = {};
    for (let m = 1; m <= 12; m++) tpMonthMap[m] = 0;
    for (const r of tpByMonth) tpMonthMap[r.month] = parseFloat(r.total as any) || 0;

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
      revenueByType: ((revenueByType.rows || revenueByType) as any[]).map((r: any) => ({
        typeId: r.typeId,
        typeLabel: r.typeLabel || 'Uncategorized',
        color: r.typeColor || null,
        revenue: parseFloat(r.revenue) || 0,
        count: parseInt(r.count) || 0,
      })),
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
      teamPaymentBreakdown: {
        totalPaid: tpTotal,
        memberCount: tpByMember.length,
        byMember: tpByMember.map((m: any) => ({
          name: m.name || 'Unknown',
          role: m.role || 'crew',
          totalPaid: parseFloat(m.totalPaid as any) || 0,
          jobCount: parseInt(m.jobCount as any) || 0,
          avgPerJob: (parseFloat(m.totalPaid as any) || 0) / (parseInt(m.jobCount as any) || 1),
        })),
        byMonth: Object.values(tpMonthMap),
        byMethod: tpByMethod.map((m: any) => ({
          method: m.method || 'Unknown',
          total: parseFloat(m.total as any) || 0,
        })),
      },
    };
  });
}
