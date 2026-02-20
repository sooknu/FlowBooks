# Non-Consecutive Shoot Sessions for Projects

## Problem

Projects currently model shoots as a continuous date range (start date → end date). Photography projects often have non-consecutive shoot days — e.g., ceremony on Monday, reception on Wednesday, party on Friday. The system needs to support individual shoot sessions within a project.

## Design

### Data Model

New `project_sessions` table:

| Column | Type | Notes |
|--------|------|-------|
| `id` | text (UUID PK) | `crypto.randomUUID()` |
| `project_id` | text FK → projects | Cascade delete |
| `label` | text, nullable | e.g., "Ceremony", "Reception" |
| `session_date` | timestamp | The date of this session |
| `start_time` | text, nullable | HH:MM format |
| `end_time` | text, nullable | HH:MM format |
| `sort_order` | integer, default 0 | UI ordering |
| `created_at` | timestamp | Default now |

**Backward compatibility:** The existing `shootStartDate` and `shootEndDate` columns on `projects` are kept and auto-synced. When sessions are saved, `shootStartDate = min(session dates)` and `shootEndDate = max(session dates)`. This preserves calendar range queries, stats, and any code reading these fields.

**Simple projects:** Single-day projects without sessions continue to work exactly as today using `shootStartDate` + `shootStartTime`/`shootEndTime`. No sessions table rows needed.

### UX — Project Form

- "Multi-day shoot" checkbox becomes **"Multiple sessions"**
- **Unchecked:** Same as today — single date + start/end time fields
- **Checked:** Shows an editable list of session rows:
  - Each row: Label (text), Date (date picker), Start Time, End Time, delete button
  - "Add Session" button at bottom
  - Delivery date remains separate, below sessions
- When toggling from sessions back to single-date, sessions are cleared

### Calendar Display

- Backend range query unchanged (uses `shootStartDate`/`shootEndDate` for overlap)
- Frontend `groupByDate()` updated: if project has `sessions` array, iterate session dates instead of looping start→end range
- Calendar cards show session label when present (e.g., "Smith Wedding — Ceremony")

### Project Detail

- Overview: when project has sessions, show a list of sessions with labels, dates, and times instead of a single date range
- Hero meta bar: show "3 sessions" with first/last date range instead of continuous date range

### API Changes

- `GET /api/projects` and `GET /api/projects/:id` include `sessions` in the `with` clause
- `POST /api/projects` and `PUT /api/projects/:id` accept a `sessions` array in the body; backend replaces all sessions (delete + re-insert) and auto-syncs `shootStartDate`/`shootEndDate`
- `GET /api/calendar` response includes sessions per project (already included via `with` clause)
- Team assignments remain project-level (no per-session assignment)

## Decisions

- **Approach A chosen** (relational child table) over JSON column or exclusion-based approaches
- Sessions have optional labels and optional start/end times
- Team assignments stay project-level — not per-session
- `shootStartDate`/`shootEndDate` auto-synced for backward compatibility
