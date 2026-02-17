import type { TeamRole } from './permissions';

// ── Permission keys ──
export const PERMISSION_KEYS = [
  'view_prices',
  'view_financial_summary',
  'edit_project_status',
  'lock_projects',
  'delete_projects',
  'edit_quotes',
  'edit_invoices',
  'manage_clients',
  'manage_services',
  'view_expenses',
  'manage_expenses',
  'view_team',
  'manage_team_members',
  'manage_assignments',
  'manage_team_payments',
  'delete_team_payments',
  'filter_calendar_by_team',
  'access_settings',
  'view_activity_log',
  'view_advances',
  'manage_advances',
  'view_salary',
  'manage_salary',
  'manage_backups',
] as const;

export type PermissionKey = typeof PERMISSION_KEYS[number];

// ── Permission metadata (labels + groups for UI) ──
export interface PermissionMeta {
  key: PermissionKey;
  label: string;
  group: string;
  description?: string;
}

export const PERMISSION_GROUPS = ['Visibility', 'Projects', 'Sales', 'Finance', 'Team', 'Calendar', 'Settings'] as const;

export const PERMISSION_META: PermissionMeta[] = [
  { key: 'view_prices', label: 'View Prices', group: 'Visibility', description: 'See prices on quotes, invoices, and project overviews' },
  { key: 'view_financial_summary', label: 'View Financial Summary', group: 'Visibility', description: 'See revenue, cost, and margin cards' },
  { key: 'edit_project_status', label: 'Edit Project Status', group: 'Projects', description: 'Change project status (lead, booked, etc.)' },
  { key: 'lock_projects', label: 'Lock/Unlock Projects', group: 'Projects', description: 'Lock or unlock projects for editing' },
  { key: 'delete_projects', label: 'Delete Projects', group: 'Projects', description: 'Permanently delete (archive) projects' },
  { key: 'edit_quotes', label: 'Edit Quotes', group: 'Sales', description: 'Create and edit quotes' },
  { key: 'edit_invoices', label: 'Edit Invoices', group: 'Sales', description: 'Create and edit invoices' },
  { key: 'manage_clients', label: 'Manage Clients', group: 'Sales', description: 'Create, edit, and delete clients' },
  { key: 'manage_services', label: 'Manage Services', group: 'Settings', description: 'Create and edit service/product catalog' },
  { key: 'view_expenses', label: 'View Expenses', group: 'Finance', description: 'See the expenses page' },
  { key: 'manage_expenses', label: 'Manage Expenses', group: 'Finance', description: 'Create, edit, and delete expenses' },
  { key: 'view_team', label: 'View Team Page', group: 'Team', description: 'Access the team management page' },
  { key: 'manage_team_members', label: 'Manage Team Members', group: 'Team', description: 'Add, edit, and remove team members' },
  { key: 'manage_assignments', label: 'Manage Assignments', group: 'Team', description: 'Assign team members to projects' },
  { key: 'manage_team_payments', label: 'Manage Team Payments', group: 'Team', description: 'Create and edit team payments' },
  { key: 'delete_team_payments', label: 'Delete Team Payments', group: 'Team', description: 'Delete team payment records' },
  { key: 'filter_calendar_by_team', label: 'Filter Calendar by Team', group: 'Calendar', description: 'Filter calendar view by team member' },
  { key: 'access_settings', label: 'Access Settings', group: 'Settings', description: 'Access system settings pages' },
  { key: 'view_activity_log', label: 'View Activity Log', group: 'Settings', description: 'View system activity log' },
  { key: 'view_advances', label: 'View Advances', group: 'Finance', description: 'See the advances page (read-only)' },
  { key: 'manage_advances', label: 'Manage Advances', group: 'Finance', description: 'Create and manage team advances' },
  { key: 'view_salary', label: 'View Salaries', group: 'Finance', description: 'See the salary page (read-only)' },
  { key: 'manage_salary', label: 'Manage Salary', group: 'Finance', description: 'Create and manage salary entries' },
  { key: 'manage_backups', label: 'Manage Backups', group: 'Settings', description: 'Create, view, and delete backups' },
];

// ── Hardcoded defaults per role ──
// true = granted by default, false = denied by default
// Owner always gets all permissions (enforced in resolution, not here)

type RoleDefaults = Record<PermissionKey, boolean>;
type AllRoleDefaults = Record<TeamRole, RoleDefaults>;

export const DEFAULT_ROLE_PERMISSIONS: AllRoleDefaults = {
  owner: Object.fromEntries(PERMISSION_KEYS.map(k => [k, true])) as RoleDefaults,
  manager: {
    view_prices: true,
    view_financial_summary: true,
    edit_project_status: true,
    lock_projects: true,
    delete_projects: true,
    edit_quotes: true,
    edit_invoices: true,
    manage_clients: true,
    manage_services: true,
    view_expenses: true,
    manage_expenses: true,
    view_team: true,
    manage_team_members: true,
    manage_assignments: true,
    manage_team_payments: true,
    delete_team_payments: true,
    filter_calendar_by_team: true,
    access_settings: true,
    view_activity_log: false,
    view_advances: true,
    manage_advances: true,
    view_salary: true,
    manage_salary: true,
    manage_backups: true,
  },
  lead: {
    view_prices: true,
    view_financial_summary: true,
    edit_project_status: false,
    lock_projects: false,
    delete_projects: false,
    edit_quotes: false,
    edit_invoices: false,
    manage_clients: false,
    manage_services: false,
    view_expenses: true,
    manage_expenses: false,
    view_team: true,
    manage_team_members: false,
    manage_assignments: false,
    manage_team_payments: false,
    delete_team_payments: false,
    filter_calendar_by_team: true,
    access_settings: false,
    view_activity_log: false,
    view_advances: true,
    manage_advances: false,
    view_salary: true,
    manage_salary: false,
    manage_backups: false,
  },
  crew: {
    view_prices: false,
    view_financial_summary: false,
    edit_project_status: false,
    lock_projects: false,
    delete_projects: false,
    edit_quotes: false,
    edit_invoices: false,
    manage_clients: false,
    manage_services: false,
    view_expenses: false,
    manage_expenses: false,
    view_team: false,
    manage_team_members: false,
    manage_assignments: false,
    manage_team_payments: false,
    delete_team_payments: false,
    filter_calendar_by_team: false,
    access_settings: false,
    view_activity_log: false,
    view_advances: false,
    manage_advances: false,
    view_salary: false,
    manage_salary: false,
    manage_backups: false,
  },
};
