# Project Sessions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow projects to have multiple non-consecutive shoot sessions (e.g., ceremony Monday, reception Wednesday, party Friday) instead of only a continuous date range.

**Architecture:** New `project_sessions` child table with label, date, start/end time per session. Sessions are managed inline on the project form (replace "Multi-day shoot" with "Multiple sessions"). The existing `shootStartDate`/`shootEndDate` fields auto-sync from min/max session dates for backward compatibility. Calendar and ProjectDetail updated to display individual sessions.

**Tech Stack:** Drizzle ORM (PostgreSQL), Fastify routes, React form with dynamic rows

---

### Task 1: Add `projectSessions` table to schema

**Files:**
- Modify: `server/db/schema.ts`

**Step 1: Add table definition after `projectNotes` (after line 421)**

```typescript
// ── Project sessions (non-consecutive shoot dates) ──

export const projectSessions = pgTable('project_sessions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  label: text('label'),
  sessionDate: timestamp('session_date', { mode: 'date' }).notNull(),
  startTime: text('start_time'),
  endTime: text('end_time'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('project_sessions_project_id_idx').on(table.projectId),
]);
```

**Step 2: Add `sessions` to `projectRelations` (~line 739, after `recurringExpenses`)**

```typescript
  sessions: many(projectSessions),
```

**Step 3: Add `projectSessionRelations` after `projectNoteRelations` (~line 744)**

```typescript
export const projectSessionRelations = relations(projectSessions, ({ one }) => ({
  project: one(projects, { fields: [projectSessions.projectId], references: [projects.id] }),
}));
```

**Step 4: Add `projectSessions` to the imports in `server/routes/projects.ts` (line 2)**

Add `projectSessions` to the destructured import from `'../db/schema'`.

**Step 5: Push schema**

Run: `npm run db:push`
Expected: `[✓] Changes applied`

---

### Task 2: Handle sessions in project create/update routes

**Files:**
- Modify: `server/routes/projects.ts`

**Step 1: Add helper to sync sessions + auto-compute shootStartDate/shootEndDate**

After `mapProjectBody()` (~line 27), add:

```typescript
async function syncSessions(projectId: string, sessions: any[]) {
  // Delete existing sessions
  await db.delete(projectSessions).where(eq(projectSessions.projectId, projectId));

  if (!sessions || sessions.length === 0) return;

  // Insert new sessions
  await db.insert(projectSessions).values(
    sessions.map((s: any, i: number) => ({
      projectId,
      label: s.label || null,
      sessionDate: parseDateInput(s.sessionDate || s.session_date)!,
      startTime: s.startTime || s.start_time || null,
      endTime: s.endTime || s.end_time || null,
      sortOrder: s.sortOrder ?? i,
    }))
  );

  // Auto-sync shootStartDate/shootEndDate from session bounds
  const dates = sessions
    .map((s: any) => parseDateInput(s.sessionDate || s.session_date))
    .filter(Boolean) as Date[];
  if (dates.length > 0) {
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
    await db.update(projects).set({
      shootStartDate: minDate,
      shootEndDate: dates.length > 1 ? maxDate : null,
      shootStartTime: null,
      shootEndTime: null,
      updatedAt: new Date(),
    }).where(eq(projects.id, projectId));
  }
}
```

**Step 2: Call `syncSessions` in POST route (after line 148, before logActivity)**

```typescript
    if (request.body.sessions?.length) {
      await syncSessions(data.id, request.body.sessions);
    }
```

**Step 3: Call `syncSessions` in PUT route (after line 210, before logActivity)**

```typescript
    if ('sessions' in b) {
      await syncSessions(request.params.id, b.sessions || []);
    }
```

**Step 4: Add `sessions` to all re-fetch `with` clauses**

In GET `/:id` (line 107 `with` block), add:
```typescript
        sessions: { orderBy: (s: any, { asc }: any) => [asc(s.sortOrder)] },
```

In POST re-fetch (line 155), update to:
```typescript
      with: { client: true, projectTypeRel: true, sessions: { orderBy: (s: any, { asc }: any) => [asc(s.sortOrder)] } },
```

In PUT re-fetch (line 216), update to:
```typescript
      with: { client: true, projectTypeRel: true, sessions: { orderBy: (s: any, { asc }: any) => [asc(s.sortOrder)] } },
```

In GET list (line 92), add sessions:
```typescript
        with: { client: true, projectTypeRel: true, sessions: { orderBy: (s: any, { asc }: any) => [asc(s.sortOrder)] } },
```

---

### Task 3: Include sessions in calendar API response

**Files:**
- Modify: `server/routes/calendar.ts`

The calendar route uses raw `.select()` joins (not `.query` with `with`), so we need to fetch sessions separately and merge them.

**Step 1: Import `projectSessions` at the top**

Add to imports from `'../db/schema'`.

**Step 2: After each `data` query result, fetch and merge sessions**

After line 70 (non-privileged path) and line 93 (privileged path), before returning, add session fetching. Simplest approach: add a helper that enriches projects with their sessions.

Add before `formatProjects`:

```typescript
async function attachSessions(projectRows: any[]) {
  const ids = projectRows.map(r => r.id);
  if (ids.length === 0) return projectRows;
  const sessions = await db
    .select()
    .from(projectSessions)
    .where(inArray(projectSessions.projectId, ids))
    .orderBy(ascFn(projectSessions.sortOrder));
  const sessionMap: Record<string, any[]> = {};
  for (const s of sessions) {
    if (!sessionMap[s.projectId]) sessionMap[s.projectId] = [];
    sessionMap[s.projectId].push(s);
  }
  return projectRows.map(p => ({ ...p, sessions: sessionMap[p.id] || [] }));
}
```

Update both return paths:
- Line 70: `return { data: formatProjects(await attachSessions(data)) };`
- Line 95: `return { data: formatProjects(await attachSessions(data)) };`

Add missing imports: `inArray`, `ascFn` (alias for `asc`) from drizzle-orm; `projectSessions` from schema.

---

### Task 4: Update ProjectForm with session rows

**Files:**
- Modify: `src/components/ProjectForm.jsx`

**Step 1: Add `sessions` to `EMPTY_FORM` (line 28)**

```javascript
  sessions: [],
```

**Step 2: Populate sessions in edit mode (line 107 useEffect)**

After `shootEndTime` line, add:
```javascript
        sessions: (project.sessions || []).map(s => ({
          label: s.label || '',
          sessionDate: s.sessionDate ? new Date(s.sessionDate).toISOString().split('T')[0] : '',
          startTime: s.startTime || '',
          endTime: s.endTime || '',
        })),
```

**Step 3: Rename "Multi-day shoot" to "Multiple sessions" (line 367)**

Change `<span className="text-xs text-surface-500">Multi-day shoot</span>` to `<span className="text-xs text-surface-500">Multiple sessions</span>`

**Step 4: Update the multi-day toggle handler (line 361-363)**

When toggling ON (to sessions mode): clear single-day fields, seed with 2 empty session rows.
When toggling OFF (to single-day mode): clear sessions and shootEndDate.

```javascript
            onChange={e => {
              const checked = e.target.checked;
              setIsMultiDay(checked);
              if (checked) {
                setForm(prev => ({
                  ...prev,
                  shootEndDate: '',
                  shootStartTime: '',
                  shootEndTime: '',
                  sessions: prev.sessions.length > 0 ? prev.sessions : [
                    { label: '', sessionDate: prev.shootStartDate || '', startTime: '', endTime: '' },
                    { label: '', sessionDate: '', startTime: '', endTime: '' },
                  ],
                }));
              } else {
                setForm(prev => ({ ...prev, shootEndDate: '', sessions: [] }));
              }
            }}
```

**Step 5: Replace the multi-day date grid with session rows**

When `isMultiDay` is true, instead of showing `shootEndDate`, show session rows:

```jsx
        {isMultiDay ? (
          <div className="space-y-2">
            {form.sessions.map((session, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-end">
                <div>
                  {idx === 0 && <label className="text-xs font-medium text-surface-600 mb-1 block">Label</label>}
                  <input
                    type="text"
                    value={session.label}
                    onChange={e => {
                      const updated = [...form.sessions];
                      updated[idx] = { ...updated[idx], label: e.target.value };
                      setForm({ ...form, sessions: updated });
                    }}
                    className="glass-input w-full"
                    placeholder="e.g. Ceremony"
                  />
                </div>
                <div>
                  {idx === 0 && <label className="text-xs font-medium text-surface-600 mb-1 block">Date</label>}
                  <input
                    type="date"
                    value={session.sessionDate}
                    onChange={e => {
                      const updated = [...form.sessions];
                      updated[idx] = { ...updated[idx], sessionDate: e.target.value };
                      setForm({ ...form, sessions: updated });
                    }}
                    className="glass-input w-full"
                  />
                </div>
                <div>
                  {idx === 0 && <label className="text-xs font-medium text-surface-600 mb-1 block">Start</label>}
                  <input
                    type="time"
                    value={session.startTime}
                    onChange={e => {
                      const updated = [...form.sessions];
                      updated[idx] = { ...updated[idx], startTime: e.target.value };
                      setForm({ ...form, sessions: updated });
                    }}
                    className="glass-input w-full"
                  />
                </div>
                <div>
                  {idx === 0 && <label className="text-xs font-medium text-surface-600 mb-1 block">End</label>}
                  <input
                    type="time"
                    value={session.endTime}
                    onChange={e => {
                      const updated = [...form.sessions];
                      updated[idx] = { ...updated[idx], endTime: e.target.value };
                      setForm({ ...form, sessions: updated });
                    }}
                    className="glass-input w-full"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const updated = form.sessions.filter((_, i) => i !== idx);
                    setForm({ ...form, sessions: updated });
                  }}
                  className="p-2 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                  title="Remove session"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setForm({ ...form, sessions: [...form.sessions, { label: '', sessionDate: '', startTime: '', endTime: '' }] })}
              className="action-btn action-btn--secondary text-xs !py-1.5"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Session
            </button>
          </div>
        ) : (
          /* existing single-day date grid */
        )}
```

Ensure `X` and `Plus` are imported from lucide-react (check existing imports).

**Step 6: Update submit handler to include sessions**

In the payload construction (~line 185), add:
```javascript
    sessions: isMultiDay ? form.sessions.filter(s => s.sessionDate) : [],
```

And for the edit (PUT) path, include sessions in the update payload.

**Step 7: Keep delivery date below the sessions block** (already separate)

---

### Task 5: Update ProjectDetail to display sessions

**Files:**
- Modify: `src/components/ProjectDetail.jsx`

**Step 1: Update overview props section (~line 172)**

Replace the single-date/range display with session-aware logic:

```jsx
          {(() => {
            const dateRange = formatDateRange(project.shootStartDate, project.shootEndDate);
            if (project.sessions?.length > 0) {
              return project.sessions.map((s, i) => (
                <div key={i} className="project-details__prop">
                  <span className="project-details__prop-label">
                    <Calendar className="project-details__prop-icon" /> {s.label || `Session ${i + 1}`}
                  </span>
                  <span className="project-details__prop-value">
                    {formatDate(s.sessionDate)}
                    {s.startTime && (
                      <span className="project-details__prop-hint">
                        {formatTimeRange(s.startTime, s.endTime)}
                      </span>
                    )}
                  </span>
                </div>
              ));
            }
            if (dateRange) return ( /* existing range display */ );
            if (project.shootStartDate) { /* existing single-day display */ }
            return null;
          })()}
```

**Step 2: Update hero meta bar (~line 1322)**

When sessions exist, show count + date span:

```jsx
                if (project.sessions?.length > 0) {
                  const sorted = [...project.sessions].sort((a, b) => new Date(a.sessionDate) - new Date(b.sessionDate));
                  return (
                    <>
                      <span className="project-hero__dot" />
                      <span className="project-hero__meta-item">
                        <Calendar /> {project.sessions.length} sessions · {formatDate(sorted[0].sessionDate)} – {formatDate(sorted[sorted.length - 1].sessionDate)}
                      </span>
                    </>
                  );
                }
```

Insert this before the existing `dateRange` check.

---

### Task 6: Update CalendarView to use sessions

**Files:**
- Modify: `src/components/CalendarView.jsx`

**Step 1: Update `groupByDate()` (~line 49)**

When a project has sessions, use session dates instead of the start→end range loop:

```javascript
function groupByDate(projects) {
  const map = {};
  for (const p of projects) {
    if (p.sessions?.length > 0) {
      // Non-consecutive sessions — add to each session's date
      for (const s of p.sessions) {
        if (!s.sessionDate) continue;
        const key = format(startOfDay(new Date(s.sessionDate)), 'yyyy-MM-dd');
        if (!map[key]) map[key] = [];
        map[key].push({ ...p, _session: s });
      }
    } else {
      // Legacy continuous range
      if (!p.shootStartDate) continue;
      const start = startOfDay(new Date(p.shootStartDate));
      const end = p.shootEndDate ? startOfDay(new Date(p.shootEndDate)) : start;
      let d = start;
      while (d <= end) {
        const key = format(d, 'yyyy-MM-dd');
        if (!map[key]) map[key] = [];
        map[key].push(p);
        d = addDays(d, 1);
      }
    }
  }
  return map;
}
```

**Step 2: Show session label on calendar cards (~line 387)**

After the project title, if `_session` is present, show its label:

```jsx
                  <h3 className="text-sm font-semibold text-surface-800 truncate">
                    {p.title}
                    {p._session?.label && (
                      <span className="text-surface-400 font-normal"> — {p._session.label}</span>
                    )}
                  </h3>
```

**Step 3: Show session time instead of project time**

Update the time display section: if `p._session` exists, use its `startTime`/`endTime` instead of project-level times:

```jsx
                  {!multi && (p._session?.startTime || p.shootStartTime) && (
                    <span className="text-xs text-surface-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatTime12(p._session?.startTime || p.shootStartTime)}
                      {(p._session?.endTime || p.shootEndTime) ? ` – ${formatTime12(p._session?.endTime || p.shootEndTime)}` : ''}
                    </span>
                  )}
```

---

### Task 7: Build, deploy, and verify

**Step 1:** Run `npm run build`
**Step 2:** Run `pm2 restart FlowBooks-server`
**Step 3:** Verify:
- Create project with multiple sessions → sessions saved, calendar shows each day
- Edit project → sessions populate, can add/remove
- Toggle sessions off → reverts to single-day mode
- ProjectDetail shows session list with labels and times
- Calendar cards show "Project — Session Label" with correct times
- Existing single-day projects unaffected
