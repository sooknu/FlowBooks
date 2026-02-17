import { db } from '../db';
import { projects, clients, projectTypes, projectAssignments } from '../db/schema';
import { eq, and, or, ne, gte, lte, isNotNull, inArray } from 'drizzle-orm';
import { parseDateInput } from '../lib/dates';

export default async function calendarRoutes(fastify: any) {
  // GET /api/calendar?start=ISO&end=ISO&teamMemberId=optional
  fastify.get('/', async (request: any, reply: any) => {
    const { start, end, teamMemberId } = request.query;
    if (!start || !end) {
      return reply.code(400).send({ error: 'start and end query params are required' });
    }

    const startDate = parseDateInput(start)!;
    const endDate = parseDateInput(end)!;
    const isPrivileged = request.teamRole === 'owner' || request.teamRole === 'manager';

    // Date overlap: project has a shoot date within the visible range
    // shootStartDate must exist AND shootStartDate <= endDate AND (shootEndDate >= startDate OR shootStartDate >= startDate)
    const dateCondition = and(
      isNotNull(projects.shootStartDate),
      lte(projects.shootStartDate, endDate),
      or(
        gte(projects.shootEndDate, startDate),
        gte(projects.shootStartDate, startDate),
      ),
    );

    const baseCondition = and(
      ne(projects.status, 'archived'),
      dateCondition,
    );

    const selectFields = {
      id: projects.id,
      title: projects.title,
      projectType: projects.projectType,
      projectTypeId: projects.projectTypeId,
      projectTypeSlug: projectTypes.slug,
      projectTypeLabel: projectTypes.label,
      projectTypeColor: projectTypes.color,
      status: projects.status,
      shootStartDate: projects.shootStartDate,
      shootEndDate: projects.shootEndDate,
      location: projects.location,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
      clientCompany: clients.company,
    };

    // Non-privileged: only see projects they're assigned to
    if (!isPrivileged) {
      if (!request.teamMemberId) return { data: [] };

      const myAssignments = await db
        .select({ projectId: projectAssignments.projectId })
        .from(projectAssignments)
        .where(eq(projectAssignments.teamMemberId, request.teamMemberId));

      const myProjectIds = myAssignments.map(a => a.projectId);
      if (myProjectIds.length === 0) return { data: [] };

      const data = await db
        .select(selectFields)
        .from(projects)
        .leftJoin(clients, eq(projects.clientId, clients.id))
        .leftJoin(projectTypes, eq(projects.projectTypeId, projectTypes.id))
        .where(and(baseCondition, inArray(projects.id, myProjectIds)));

      return { data: formatProjects(data) };
    }

    // Privileged: see all, optionally filter by teamMemberId
    let teamFilter: string[] | null = null;
    if (teamMemberId) {
      const filtered = await db
        .select({ projectId: projectAssignments.projectId })
        .from(projectAssignments)
        .where(eq(projectAssignments.teamMemberId, teamMemberId));
      teamFilter = filtered.map(a => a.projectId);
      if (teamFilter.length === 0) return { data: [] };
    }

    const where = teamFilter
      ? and(baseCondition, inArray(projects.id, teamFilter))
      : baseCondition;

    const data = await db
      .select(selectFields)
      .from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(where);

    return { data: formatProjects(data) };
  });
}

function formatProjects(rows: any[]) {
  return rows.map(r => ({
    ...r,
    clientName: r.clientCompany
      || [r.clientFirstName, r.clientLastName].filter(Boolean).join(' ')
      || null,
  }));
}
