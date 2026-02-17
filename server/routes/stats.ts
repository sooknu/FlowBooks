import { db } from '../db';
import { clients, quotes, invoices, projects, projectTypes, teamMembers, projectAssignments, teamPayments, teamAdvances, teamSalary, expenses, user } from '../db/schema';
import { count, sum, eq, ne, and, desc, asc, sql, inArray, or, gte, isNull } from 'drizzle-orm';

export default async function statsRoutes(fastify: any) {
  // GET /api/stats/dashboard — unified, permission-gated
  fastify.get('/dashboard', async (request: any) => {
    const perms = request.permissions || {};
    const hasTeamMember = !!request.teamMemberId;
    const isPrivileged = perms.edit_project_status === true;

    // Build queries dynamically based on permissions
    const queries: Record<string, Promise<any>> = {};

    // --- Personal stats (anyone with a teamMemberId) ---
    if (hasTeamMember) {
      queries.myAssignments = db.select({
        id: projectAssignments.id,
        projectId: projectAssignments.projectId,
        role: projectAssignments.role,
        daysWorked: projectAssignments.daysWorked,
        hoursWorked: projectAssignments.hoursWorked,
        projectTitle: projects.title,
        projectStatus: projects.status,
        projectType: projects.projectType,
        projectTypeId: projects.projectTypeId,
        shootStartDate: projects.shootStartDate,
        shootEndDate: projects.shootEndDate,
        location: projects.location,
        clientFirstName: clients.firstName,
        clientLastName: clients.lastName,
        clientCompany: clients.company,
        projectTypeLabel: projectTypes.label,
      })
        .from(projectAssignments)
        .leftJoin(projects, eq(projectAssignments.projectId, projects.id))
        .leftJoin(clients, eq(projects.clientId, clients.id))
        .leftJoin(projectTypes, eq(projects.projectTypeId, projectTypes.id))
        .where(and(eq(projectAssignments.teamMemberId, request.teamMemberId), ne(projects.status, 'archived')))
        .orderBy(asc(projects.shootStartDate));

      queries.myEarnings = db.select({ val: sum(teamPayments.amount) })
        .from(teamPayments)
        .where(and(eq(teamPayments.teamMemberId, request.teamMemberId), eq(teamPayments.status, 'paid')));

      queries.myPending = db.select({ val: sum(teamPayments.amount) })
        .from(teamPayments)
        .where(and(eq(teamPayments.teamMemberId, request.teamMemberId), eq(teamPayments.status, 'pending')));


      queries.totalAdvanced = db.select({ val: sum(teamAdvances.amount) })
        .from(teamAdvances)
        .where(and(eq(teamAdvances.teamMemberId, request.teamMemberId), eq(teamAdvances.type, 'advance')));

      queries.totalRepaid = db.select({ val: sum(teamAdvances.amount) })
        .from(teamAdvances)
        .where(and(eq(teamAdvances.teamMemberId, request.teamMemberId), eq(teamAdvances.type, 'repayment')));

      queries.memberInfo = db.select({ advancesEnabled: teamMembers.advancesEnabled, salaryEnabled: teamMembers.salaryEnabled })
        .from(teamMembers)
        .where(eq(teamMembers.id, request.teamMemberId));

      queries.mySalaryAccrued = db.select({ val: sum(teamSalary.amount) })
        .from(teamSalary)
        .where(and(eq(teamSalary.teamMemberId, request.teamMemberId), eq(teamSalary.type, 'accrued')));

      queries.mySalaryPaid = db.select({ val: sum(teamSalary.amount) })
        .from(teamSalary)
        .where(and(eq(teamSalary.teamMemberId, request.teamMemberId), eq(teamSalary.type, 'paid')));
    }

    // --- Business financials (gated by view_financial_summary) ---
    if (perms.view_financial_summary) {
      queries.totalRevenue = db.select({ val: sum(invoices.total) })
        .from(invoices);

      queries.pendingPayments = db.select({ val: sum(sql`${invoices.total} - ${invoices.paidAmount}`) })
        .from(invoices).where(ne(invoices.status, 'paid'));


      queries.totalExpenses = db.select({ val: sum(expenses.amount) })
        .from(expenses).where(ne(expenses.type, 'credit'));

      queries.totalCredits = db.select({ val: sum(expenses.amount) })
        .from(expenses).where(eq(expenses.type, 'credit'));

      queries.totalPaidSalary = db.select({ val: sum(teamSalary.amount) })
        .from(teamSalary).where(eq(teamSalary.type, 'paid'));

      queries.salaryByMemberRaw = db.select({
        teamMemberId: teamSalary.teamMemberId,
        name: user.name,
        type: teamSalary.type,
        total: sum(teamSalary.amount),
      })
        .from(teamSalary)
        .innerJoin(teamMembers, eq(teamSalary.teamMemberId, teamMembers.id))
        .innerJoin(user, eq(teamMembers.userId, user.id))
        .groupBy(teamSalary.teamMemberId, user.name, teamSalary.type);
    }

    // --- Entity counts (privileged: owner/manager) ---
    if (isPrivileged) {
      queries.clientsCount = db.select({ val: count() }).from(clients);
      queries.quotesCount = db.select({ val: count() }).from(quotes);
      queries.invoicesCount = db.select({ val: count() }).from(invoices);
      queries.projectsCount = db.select({ val: count() }).from(projects).where(ne(projects.status, 'archived'));

      queries.upcomingProjects = db.select({
        id: projects.id,
        title: projects.title,
        status: projects.status,
        projectType: projects.projectType,
        projectTypeId: projects.projectTypeId,
        projectTypeSlug: projectTypes.slug,
        projectTypeLabel: projectTypes.label,
        projectTypeColor: projectTypes.color,
        shootStartDate: projects.shootStartDate,
        shootEndDate: projects.shootEndDate,
        location: projects.location,
        clientFirstName: clients.firstName,
        clientLastName: clients.lastName,
        clientCompany: clients.company,
      })
        .from(projects)
        .leftJoin(clients, eq(projects.clientId, clients.id))
        .leftJoin(projectTypes, eq(projects.projectTypeId, projectTypes.id))
        .where(
          and(
            ne(projects.status, 'archived'),
            ne(projects.status, 'completed'),
            or(
              gte(projects.shootStartDate, new Date()),
              and(
                inArray(projects.status, ['lead', 'booked']),
                isNull(projects.shootStartDate),
              ),
            ),
          ),
        )
        .orderBy(asc(projects.shootStartDate))
        .limit(6);
    }

    // --- Recent docs (gated by edit_quotes / edit_invoices) ---
    if (perms.edit_quotes) {
      queries.recentQuotes = db.select({
        id: quotes.id,
        quoteNumber: quotes.quoteNumber,
        clientName: quotes.clientName,
        total: quotes.total,
        createdAt: quotes.createdAt,
      }).from(quotes).orderBy(desc(quotes.createdAt)).limit(3);
    }

    if (perms.edit_invoices) {
      queries.recentInvoices = db.select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        clientName: invoices.clientName,
        total: invoices.total,
        status: invoices.status,
        createdAt: invoices.createdAt,
      }).from(invoices).orderBy(desc(invoices.createdAt)).limit(3);
    }

    // Execute all queries in parallel
    const keys = Object.keys(queries);
    const values = await Promise.all(Object.values(queries));
    const d: Record<string, any> = {};
    keys.forEach((key, i) => { d[key] = values[i]; });

    // --- Assemble response ---
    const result: any = { hasTeamMember };

    // Personal stats
    if (hasTeamMember) {
      result.myAssignments = (d.myAssignments || []).map((a: any) => ({
        ...a,
        clientName: a.clientCompany || [a.clientFirstName, a.clientLastName].filter(Boolean).join(' ') || null,
      }));
      result.myEarnings = parseFloat(d.myEarnings?.[0]?.val as string) || 0;
      result.myPending = parseFloat(d.myPending?.[0]?.val as string) || 0;

      const memberInfo = d.memberInfo?.[0];
      result.advancesEnabled = memberInfo?.advancesEnabled || false;
      result.salaryEnabled = memberInfo?.salaryEnabled || false;
      result.advanceBalance = result.advancesEnabled
        ? (parseFloat(d.totalAdvanced?.[0]?.val as string) || 0) - (parseFloat(d.totalRepaid?.[0]?.val as string) || 0)
        : 0;
      result.salaryBalance = result.salaryEnabled
        ? (parseFloat(d.mySalaryAccrued?.[0]?.val as string) || 0) - (parseFloat(d.mySalaryPaid?.[0]?.val as string) || 0)
        : 0;
    }

    // Business financials
    if (perms.view_financial_summary) {
      result.totalRevenue = parseFloat(d.totalRevenue?.[0]?.val as string) || 0;
      result.pendingPayments = parseFloat(d.pendingPayments?.[0]?.val as string) || 0;
      result.totalExpenses = parseFloat(d.totalExpenses?.[0]?.val as string) || 0;
      result.totalCredits = parseFloat(d.totalCredits?.[0]?.val as string) || 0;
      result.totalPaidSalary = parseFloat(d.totalPaidSalary?.[0]?.val as string) || 0;

      // Salary breakdown
      const salaryMap: Record<string, { name: string; accrued: number; paid: number }> = {};
      for (const row of (d.salaryByMemberRaw || [])) {
        if (!salaryMap[row.teamMemberId]) salaryMap[row.teamMemberId] = { name: row.name, accrued: 0, paid: 0 };
        salaryMap[row.teamMemberId][row.type as 'accrued' | 'paid'] = parseFloat(row.total as string) || 0;
      }
      result.salaryByMember = Object.values(salaryMap)
        .map(m => ({ name: m.name, owed: m.accrued - m.paid }))
        .filter(m => m.owed > 0)
        .sort((a, b) => b.owed - a.owed);
      result.salaryOwed = result.salaryByMember.reduce((s: number, m: any) => s + m.owed, 0);
    }

    // Entity counts
    if (isPrivileged) {
      result.clientsCount = d.clientsCount?.[0]?.val ?? 0;
      result.quotesCount = d.quotesCount?.[0]?.val ?? 0;
      result.invoicesCount = d.invoicesCount?.[0]?.val ?? 0;
      result.projectsCount = d.projectsCount?.[0]?.val ?? 0;

      if (d.upcomingProjects) {
        result.upcomingProjects = d.upcomingProjects.map((p: any) => ({
          ...p,
          clientName: p.clientCompany || [p.clientFirstName, p.clientLastName].filter(Boolean).join(' ') || null,
        }));
      }
    }

    // Recent docs
    if (d.recentQuotes) result.recentQuotes = d.recentQuotes;
    if (d.recentInvoices) result.recentInvoices = d.recentInvoices;

    return result;
  });
}
